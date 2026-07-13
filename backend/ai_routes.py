import os
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq
from backend.database import Database

# Create the router instance
router = APIRouter()

# Initialize Groq client
# Ensure your .env file has GROQ_API_KEY configured properly
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class ChatRequest(BaseModel):
    email: str
    message: str

# Strict AI Persona Instruction
CYBER_DOC_PROMPT = """
You are 'BioNexus AI Core', an elite, highly strict, and professional medical diagnostic AI. 
Follow these rules STRICTLY:

1. MEDICAL INQUIRY ONLY: You ONLY answer health, symptom, and medical-related questions. 
If the user asks about ANY of the following topics, you MUST reply with EXACTLY this string and nothing else: "[FLAG: UNAUTHORIZED]"
   - Illegal, recreational, or extreme drugs (e.g., heroin, cocaine, weed, narcotics, etc.).
   - 18+, adult, sexually explicit, or NSFW content.
   - Coding, jokes, politics, movies, or any other non-medical nonsense.

2. NO IMMEDIATE PRESCRIPTION: If a user tells you their symptoms, NEVER recommend medicine in your first response. Like a real doctor, you MUST ask 2-3 specific follow-up questions (e.g., duration, severity, allergies, past medical history). 

3. SAFE MEDICINE ONLY: Only recommend Over-The-Counter (OTC) medicines. NEVER recommend restricted, highly potent, or prescription-only drugs. Provide exact generic names, not just brand names.

4. DIAGNOSIS & ACTION: Once you have enough information from the user's answers, provide:
   - A probable diagnosis.
   - The exact OTC medicine with dosage.
   - Rest/Diet instructions.
   - A strict disclaimer advising them to see a human doctor if symptoms persist.

5. TONE: Professional, empathetic but highly clinical and authoritative.
"""

@router.post("/chat")
async def ai_doctor_chat(request: ChatRequest):
    user_email = request.email
    user_message = request.message
    
    # Fetch the live initialized database instance right inside the endpoint
    db = Database.db 
    
    # 1. Fetch user from database
    user = await db.users.find_one({"email": user_email})
    if not user:
        # 🌟 FIX: Instead of throwing a hard 404 HTTP Error, return a soft JSON warning to the chat UI
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
    history = user.get("chat_history", [])[-6:] 
    
    messages = [{"role": "system", "content": CYBER_DOC_PROMPT}]
    for chat in history:
        messages.append({"role": chat["role"], "content": chat["content"]})
    
    # Append the new incoming message
    messages.append({"role": "user", "content": user_message})

    try:
        # 4. Request response from Groq API
        chat_completion = groq_client.chat.completions.create(
            messages=messages,
            # 🌟 FIX: Updated to a supported, highly capable Groq model
            model="llama-3.3-70b-versatile", 
            temperature=0.3,         # Low temperature for highly logical and strict responses
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
        # 🌟 FIX: Return API errors directly to the chat interface so the frontend doesn't break
        print(f"Groq API Error: {str(e)}")
        return {
            "status": "warning",
            "message": f"Connection Error: AI Core is experiencing overload or API key is missing. Detail: {str(e)}"
        }