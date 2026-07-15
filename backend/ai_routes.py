import os
import base64
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from groq import Groq, AsyncGroq
from backend.database import Database

# Create the router instance
router = APIRouter()

# Initialize Groq clients
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
async_groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

# ==========================================
# REQUEST MODELS
# ==========================================
class ChatRequest(BaseModel):
    email: str
    message: str
    language: Optional[str] = "english"

class VoiceChatRequest(BaseModel):
    email: str
    audio_base64: str
    language: Optional[str] = "english"

# ==========================================
# LANGUAGE CONFIGURATION
# ==========================================
LANGUAGE_MAP = {
    "english": {
        "name": "English",
        "instruction": "Respond entirely in English.",
        "whisper_code": "en"
    },
    "hindi": {
        "name": "Hindi (हिन्दी)",
        "instruction": "Respond entirely in Hindi (हिन्दी). Use Devanagari script. Use proper Hindi medical terminology where possible, but keep it understandable for common people.",
        "whisper_code": "hi"
    },
    "bengali": {
        "name": "Bengali (বাংলা)",
        "instruction": "Respond entirely in Bengali (বাংলা). Use Bengali script. Use proper Bengali medical terminology where possible, but keep it understandable for common people.",
        "whisper_code": "bn"
    },
    "bhojpuri": {
        "name": "Bhojpuri (भोजपुरी)",
        "instruction": "Respond entirely in Bhojpuri (भोजपुरी). Use Devanagari script. Keep the tone warm and relatable like a trusted village doctor who speaks fluent Bhojpuri.",
        "whisper_code": "hi"
    },
    "gujarati": {
        "name": "Gujarati (ગુજરાતી)",
        "instruction": "Respond entirely in Gujarati (ગુજરાતી). Use Gujarati script. Use proper Gujarati medical terminology where possible, but keep it understandable for common people.",
        "whisper_code": "gu"
    }
}

# ==========================================
# ELITE MEDICAL AI PERSONA
# ==========================================
def get_cyber_doc_prompt(language: str = "english"):
    lang_config = LANGUAGE_MAP.get(language, LANGUAGE_MAP["english"])
    lang_instruction = lang_config["instruction"]
    
    return f"""
You are 'BioNexus AI Core', an elite, board-certified AI medical diagnostic assistant with 20+ years of simulated clinical experience. You function as a highly educated, premium-tier doctor — precise, thorough, empathetic, and strict.

=== LANGUAGE RULE ===
{lang_instruction}
If the user writes in a specific language, ALWAYS respond in that same language regardless of this setting.

=== CORE MEDICAL PROTOCOL ===

**PHASE 1 — INITIAL ASSESSMENT (First Response to Symptoms):**
When a user first describes symptoms, you MUST NOT prescribe medicine immediately. Instead:
1. Acknowledge their symptoms professionally
2. Ask 3-4 SPECIFIC follow-up questions to narrow down the diagnosis:
   - Duration: "How long have you been experiencing this?"
   - Severity: "On a scale of 1-10, how severe is the pain/discomfort?"
   - Onset: "Did this start suddenly or gradually?"
   - Associated symptoms: "Are you experiencing any other symptoms like fever, nausea, dizziness?"
   - Medical history: "Do you have any pre-existing conditions or allergies to any medicines?"
   - Triggers: "Did anything specific trigger this? (food, activity, stress, weather)"

**PHASE 2 — CLINICAL ANALYSIS (After User Answers Follow-ups):**
Once you have sufficient information from the user's answers:
1. State your **Probable Diagnosis** with confidence level (e.g., "Based on your symptoms, this appears to be [condition] — Confidence: High/Moderate")
2. Briefly explain the condition in simple terms

**PHASE 3 — PRESCRIPTION & TREATMENT PLAN:**
After diagnosis, provide a structured treatment plan:

📋 **DIAGNOSIS:** [Condition name]

💊 **MEDICINE:**
- [Medicine Name (Generic)] — [Dosage] — [Frequency] — [Duration]
- Example: Paracetamol (Acetaminophen) — 500mg — Every 6-8 hours — For 3 days
- List alternatives if applicable

🍽️ **DIET & REST:**
- Specific foods to eat and avoid
- Rest recommendations
- Hydration guidelines

⚠️ **RED FLAGS — See a Doctor Immediately If:**
- List 2-3 warning signs that require immediate medical attention

📌 **DISCLAIMER:** This is AI-assisted preliminary guidance only. Always consult a qualified healthcare professional for proper diagnosis and treatment. Do not self-medicate for prolonged periods.

=== STRICT ENFORCEMENT RULES ===

1. **MEDICAL ONLY:** You EXCLUSIVELY handle health, medical, symptom, wellness, and fitness queries.
   If the user asks about ANY of these topics, reply with EXACTLY this string and nothing else: "[FLAG: UNAUTHORIZED]"
   - Illegal drugs, recreational substances, narcotics
   - Adult/sexual/NSFW content
   - Coding, programming, technology (non-health)
   - Politics, entertainment, movies, jokes, general chat
   - Violence, weapons, harmful activities

2. **SAFE PRESCRIPTIONS ONLY:**
   - Only recommend Over-The-Counter (OTC) medicines
   - NEVER prescribe controlled substances, opioids, strong sedatives, or prescription-only drugs
   - Always include generic names, not just brand names
   - Include exact dosage with timing

3. **PROFESSIONAL CONDUCT:**
   - Be empathetic but clinically authoritative
   - Never diagnose life-threatening conditions definitively — always recommend seeing a doctor
   - If symptoms suggest an emergency (chest pain, difficulty breathing, severe bleeding), immediately advise calling emergency services

4. **NO SHORTCUTS:**
   - Never skip the follow-up questions phase
   - Never give vague advice like "take some medicine"
   - Always be specific with dosage, timing, and duration
"""


# ==========================================
# MAIN CHAT ENDPOINT
# ==========================================
@router.post("/chat")
async def ai_doctor_chat(request: ChatRequest):
    user_email = request.email
    user_message = request.message
    language = request.language or "english"
    
    # Fetch the live initialized database instance
    db = Database.db 
    
    # 1. Fetch user from database
    user = await db.users.find_one({"email": user_email})
    if not user:
        return {
            "status": "warning",
            "message": f"SYSTEM ALERT: No profile found for '{user_email}'. Please update the correct userEmail in your cyber-doc.js file!"
        }
        
    # 2. Check if the user is currently blocked
    if user.get("is_blocked_until"):
        if datetime.utcnow() < user["is_blocked_until"]:
            remaining_time = user["is_blocked_until"] - datetime.utcnow()
            minutes_left = int(remaining_time.total_seconds() / 60)
            return {
                "status": "blocked", 
                "message": f"SYSTEM LOCKDOWN: You are blocked for unauthorized queries. Try again in {minutes_left} minutes."
            }
        else:
            # Block duration expired, reset warnings and unblock
            await db.users.update_one(
                {"email": user_email}, 
                {"$set": {"is_blocked_until": None, "ai_warnings": 0}}
            )

    # 3. Prepare chat history for AI context
    history = user.get("chat_history", [])[-10:]  # Keep last 10 messages for better context
    
    system_prompt = get_cyber_doc_prompt(language)
    messages = [{"role": "system", "content": system_prompt}]
    for chat in history:
        messages.append({"role": chat["role"], "content": chat["content"]})
    
    # Append the new incoming message
    messages.append({"role": "user", "content": user_message})

    try:
        # 4. Request response from Groq API
        chat_completion = groq_client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile", 
            temperature=0.3,         # Low temperature for highly logical and strict responses
            max_tokens=1024,         # Increased for detailed prescriptions
        )
        ai_response = chat_completion.choices[0].message.content
        
        # 5. Handle unauthorized queries and apply punishment logic
        if "[FLAG: UNAUTHORIZED]" in ai_response:
            current_warnings = user.get("ai_warnings", 0) + 1
            
            if current_warnings >= 3:
                # Issue 1-hour block after 3 warnings
                block_time = datetime.utcnow() + timedelta(hours=1)
                await db.users.update_one(
                    {"email": user_email},
                    {"$set": {"ai_warnings": current_warnings, "is_blocked_until": block_time}}
                )
                return {
                    "status": "blocked", 
                    "message": "CRITICAL WARNING: Multiple unauthorized queries detected. AI Core access has been revoked for 1 hour."
                }
            else:
                # Issue standard warning
                await db.users.update_one(
                    {"email": user_email}, 
                    {"$set": {"ai_warnings": current_warnings}}
                )
                return {
                    "status": "warning", 
                    "message": f"WARNING {current_warnings}/3: Please ask only health-related questions. Further violations will result in a 1-hour system block."
                }

        # 6. Save valid medical conversation to database
        new_chats = [
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": ai_response}
        ]
        
        await db.users.update_one(
            {"email": user_email},
            {"$push": {"chat_history": {"$each": new_chats}}}
        )

        return {"status": "success", "message": ai_response}

    except Exception as e:
        print(f"Groq API Error: {str(e)}")
        return {
            "status": "warning",
            "message": f"Connection Error: AI Core is experiencing overload or API key is missing. Detail: {str(e)}"
        }


# ==========================================
# VOICE CHAT ENDPOINT (Groq Whisper STT)
# ==========================================
@router.post("/voice-chat")
async def ai_voice_chat(request: VoiceChatRequest):
    """
    Accepts base64-encoded audio, transcribes using Groq Whisper,
    then runs through the doctor AI and returns text response.
    """
    try:
        user_email = request.email
        language = request.language or "english"
        lang_config = LANGUAGE_MAP.get(language, LANGUAGE_MAP["english"])
        
        # Decode base64 audio
        audio_bytes = base64.b64decode(request.audio_base64)
        
        # Save temporarily for Whisper processing
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = tmp_file.name
        
        try:
            # Transcribe using Groq Whisper
            with open(tmp_path, "rb") as audio_file:
                transcription = groq_client.audio.transcriptions.create(
                    file=("audio.webm", audio_file.read()),
                    model="whisper-large-v3",
                    language=lang_config["whisper_code"],
                    response_format="text"
                )
            
            transcribed_text = transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
            
            if not transcribed_text:
                return {
                    "status": "warning",
                    "message": "Could not understand the audio. Please try speaking more clearly.",
                    "transcription": ""
                }
            
            # Now process through the doctor AI using the existing chat logic
            chat_request = ChatRequest(email=user_email, message=transcribed_text, language=language)
            ai_result = await ai_doctor_chat(chat_request)
            
            # Add transcription to the response
            ai_result["transcription"] = transcribed_text
            return ai_result
            
        finally:
            # Clean up temp file
            import os as _os
            if _os.path.exists(tmp_path):
                _os.unlink(tmp_path)
    
    except Exception as e:
        print(f"Voice Chat Error: {str(e)}")
        return {
            "status": "warning",
            "message": f"Voice processing failed: {str(e)}",
            "transcription": ""
        }