import os
from groq import Groq
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)

# Initialize Groq Client
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY)

def get_health_insight(calories: int, water: float, sleep: float, steps: int) -> str:
    """
    Takes user's daily metrics and fetches a personalized AI insight from Groq.
    """
    if not GROQ_API_KEY:
        return "AI Module Offline. Stay hydrated and prioritize your sleep."

    prompt = f"""
    Act as an expert AI health assistant for an advanced tracking app called BioNexus.
    Analyze the user's current daily metrics:
    - Calories: {calories} kcal
    - Water: {water} Liters
    - Sleep: {sleep} hours
    - Steps: {steps}

    Provide a short, highly actionable, and encouraging insight (maximum 2 sentences). 
    Keep the tone professional, futuristic, and direct. Do not use formatting like bold or italics.
    """
    
    try:
        # Using LLaMA 3 (8B) model via Groq for lightning-fast responses
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant", 
            temperature=0.6,
            max_tokens=80
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Groq API Error: {e}")
        return "Keep pushing forward! Focus on balancing your nutrition and rest today."