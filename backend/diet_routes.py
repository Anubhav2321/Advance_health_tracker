from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging
import os
from datetime import datetime
from groq import AsyncGroq
from backend.database import Database

router = APIRouter()
logger = logging.getLogger(__name__)

# ==========================================
# PYDANTIC MODELS (DATA VALIDATION)
# ==========================================
class MealItem(BaseModel):
    food_name: str
    calories: int
    protein: float
    carbs: float
    fats: float

class DietLogSubmit(BaseModel):
    user_email: str
    date: str
    meal_type: str  
    items: List[MealItem]
    total_calories: int
    total_protein: float
    total_carbs: float
    total_fats: float

class AIWarningRequest(BaseModel):
    user_email: str
    food_name: str

class RIADietChat(BaseModel):
    user_email: str
    user_message: str

# ==========================================
# HYBRID FOOD DATABASE (MOCK)
# ==========================================
FOOD_MATRIX_DB = {
    "chicken breast": {"calories": 165, "protein": 31.0, "carbs": 0.0, "fats": 3.6},
    "rice": {"calories": 130, "protein": 2.7, "carbs": 28.0, "fats": 0.3},
    "egg": {"calories": 78, "protein": 6.0, "carbs": 0.6, "fats": 5.0},
    "roti": {"calories": 120, "protein": 4.0, "carbs": 20.0, "fats": 3.0},
    "dal": {"calories": 116, "protein": 9.0, "carbs": 20.0, "fats": 1.0},
    "whey protein": {"calories": 120, "protein": 24.0, "carbs": 3.0, "fats": 1.5},
    "apple": {"calories": 95, "protein": 0.5, "carbs": 25.0, "fats": 0.3},
    "banana": {"calories": 105, "protein": 1.3, "carbs": 27.0, "fats": 0.3},
    "milk": {"calories": 42, "protein": 3.4, "carbs": 5.0, "fats": 1.0},
    "paneer": {"calories": 265, "protein": 18.0, "carbs": 1.2, "fats": 20.0},
    "oats": {"calories": 389, "protein": 16.9, "carbs": 66.3, "fats": 6.9},
    "biryani": {"calories": 450, "protein": 15.0, "carbs": 60.0, "fats": 18.0},
    "pizza": {"calories": 285, "protein": 12.0, "carbs": 36.0, "fats": 10.0}
}

# ==========================================
# HELPER FOR GROQ AI
# ==========================================
def get_groq_client():
    groq_api_key = os.environ.get("GROQ_API_KEY", "YOUR_GROQ_API_KEY_HERE")
    if groq_api_key == "YOUR_GROQ_API_KEY_HERE":
        return None
    return AsyncGroq(api_key=groq_api_key)

# ==========================================
# EXISTING CORE ROUTES
# ==========================================
@router.get("/search")
async def search_food(query: str):
    try:
        query_lower = query.lower().strip()
        for food_name, macros in FOOD_MATRIX_DB.items():
            if food_name in query_lower or query_lower in food_name:
                return {"status": "success", "data": {"name": food_name.title(), **macros}}
        
        estimated_data = {"name": query.title(), "calories": 200, "protein": 5.0, "carbs": 20.0, "fats": 10.0}
        return {"status": "success", "data": estimated_data, "message": "Estimated via BioNexus DB"}
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

@router.post("/log")
async def log_diet(diet: DietLogSubmit):
    try:
        db = Database.db
        log_data = diet.model_dump()
        await db.diet_logs.update_one(
            {"user_email": diet.user_email, "date": diet.date},
            {
                "$push": {"meals": log_data},
                "$inc": {
                    "daily_total_calories": diet.total_calories,
                    "daily_total_protein": diet.total_protein,
                    "daily_total_carbs": diet.total_carbs,
                    "daily_total_fats": diet.total_fats
                }
            },
            upsert=True
        )
        return {"status": "success", "message": f"{diet.meal_type} synced."}
    except Exception as e:
        logger.error(f"Diet log error: {e}")
        raise HTTPException(status_code=500, detail="Failed to log diet")

@router.get("/today/{user_email}")
async def get_todays_diet(user_email: str):
    try:
        db = Database.db
        today = datetime.utcnow().strftime("%Y-%m-%d")
        diet_log = await db.diet_logs.find_one({"user_email": user_email, "date": today})
        
        if not diet_log:
            return {"status": "success", "data": {"meals": [], "daily_total_calories": 0}}
        diet_log.pop("_id", None)
        return {"status": "success", "data": diet_log}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch diet logs")


# ==========================================
# 🚀 NEW AI FEATURES (WARNING, PLANNER, RIA)
# ==========================================

@router.post("/ai-warning")
async def ai_food_warning(req: AIWarningRequest):
    """Checks if the food matches user's goal and gives a warning/alternative."""
    try:
        db = Database.db
        user = await db.users.find_one({"email": req.user_email})
        goal = user.get("goal", "maintenance") if user else "maintenance"
        
        client = get_groq_client()
        if not client:
            return {"status": "success", "warning": None} # Skip if no API key

        prompt = f"""
        The user's fitness goal is '{goal}'. They are about to eat '{req.food_name}'.
        If this food is bad for their goal (e.g. Biryani for weight loss), write a short, friendly warning starting with '⚠️' and suggest a smart, healthy alternative.
        If it is good for their goal, give a short encouraging response with '✅'.
        Keep it under 3 sentences. Be strict but polite.
        """
        
        completion = await client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant", temperature=0.6, max_tokens=150
        )
        return {"status": "success", "warning": completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"AI Warning Error: {e}")
        return {"status": "error", "warning": "AI analysis unavailable."}


@router.get("/ai-planner/{user_email}")
async def ai_meal_planner(user_email: str):
    """Generates a 1-click full day meal plan + Grocery List."""
    try:
        db = Database.db
        user = await db.users.find_one({"email": user_email})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        goal = user.get("goal", "maintenance")
        target_cal = user.get("target_calories", 2000)
        
        client = get_groq_client()
        if not client:
            return {"status": "error", "message": "API key required for Planner."}

        prompt = f"""
        Act as a professional AI dietitian. Create a strict 1-day meal plan for a user whose goal is {goal} and target is {target_cal} kcal.
        Format exactly like this (use HTML bold tags <b> for headings):
        <b>Breakfast:</b> [details]<br>
        <b>Lunch:</b> [details]<br>
        <b>Snacks:</b> [details]<br>
        <b>Dinner:</b> [details]<br>
        <b>Water Intake:</b> [details]<br>
        <br><b>🛒 Grocery List:</b> [comma separated list of items needed]
        Do not add extra conversational text.
        """
        
        completion = await client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant", temperature=0.7, max_tokens=350
        )
        return {"status": "success", "plan": completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"AI Planner Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate plan.")


@router.post("/ria-consult")
async def ria_diet_consult(req: RIADietChat):
    """Context-aware RIA chat for the Diet Page."""
    try:
        db = Database.db
        today = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Fetch Context
        user = await db.users.find_one({"email": req.user_email})
        diet_log = await db.diet_logs.find_one({"user_email": req.user_email, "date": today})
        
        target_cal = user.get("target_calories", 2000) if user else 2000
        consumed_cal = diet_log.get("daily_total_calories", 0) if diet_log else 0
        remaining_cal = target_cal - consumed_cal
        
        client = get_groq_client()
        if not client:
            return {"status": "success", "reply": "RIA is offline. Core LLaMA API missing. 🧠💤"}

        system_prompt = f"""
        You are RIA, an advanced AI health coach created by Anubhav. You are currently in the 'Diet Matrix' module.
        Context: The user has a target of {target_cal} kcal. They have consumed {consumed_cal} kcal today. Remaining: {remaining_cal} kcal.
        Rules:
        1. Answer their query keeping their remaining calories in mind.
        2. STRICT RULE: You must ONLY talk about health, diet, fitness, and nutrition. If they ask about anything else (coding, weather, general chat), output a ⚠️ warning and gently refuse, guiding them back to health.
        3. Keep it short, cute, and use emojis.
        """
        
        completion = await client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.user_message}
            ],
            model="llama-3.1-8b-instant", temperature=0.6, max_tokens=200
        )
        return {"status": "success", "reply": completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"RIA Consult Error: {e}")
        return {"status": "error", "reply": "Connection lost. Try again! 📡"}