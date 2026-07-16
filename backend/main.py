from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel
import logging
from datetime import datetime
import os
from groq import AsyncGroq
import httpx
from dotenv import load_dotenv

# .env The magic of loading secret data from a file.
load_dotenv()

# --- Security Imports ---
import jwt
import bcrypt

# --- Import Internal Modules ---
from backend.database import Database
from backend.models import (
    DailyHealthLog, UserOnboarding, UserProfile, 
    UserRegister, UserLogin, TokenResponse
)
from backend.ai_engine import get_health_insight
from backend.workout_routes import router as workout_router
from backend.stats_routes import router as stats_router
from backend.diet_routes import router as diet_router 
from backend.settings_routes import router as settings_router 
# AI Cyber-Doc Router
from backend.ai_routes import router as ai_router 

# --- Setup Professional Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

# --- Security Configuration ---
SECRET_KEY = os.environ.get("JWT_SECRET", "bionexus_super_secret_cyber_key_2026")
ALGORITHM = "HS256"

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")

# For LOCAL testing, use localhost. Switch to Render URL before deploying.
# RENDER_URI = "https://bionexus-live.onrender.com/api/auth/google/callback"
REDIRECT_URI = "https://bionexus-live.onrender.com/api/auth/google/callback"

# ==========================================
# CORE SECURITY FUNCTIONS
# ==========================================
def get_password_hash(password: str):
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(
        plain_password.encode('utf-8'), 
        hashed_password.encode('utf-8')
    )

def create_access_token(data: dict):
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)

class ChatMessage(BaseModel):
    user_message: str
    user_email: str

class ImageUpdate(BaseModel):
    user_email: str
    image_base64: str

# ==========================================
# DEFAULT BASELINE ALGORITHM
# ==========================================
def get_default_macros():
    weight = 70.0
    height = 175.0
    age = 25
    
    bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    tdee = bmr * 1.2
    
    target_calories = int(tdee)
    protein = int(weight * 2.2)
    fats = int((target_calories * 0.25) / 9)
    carbs = int((target_calories - (protein * 4) - (fats * 9)) / 4)
    water = round(2.5 + (weight * 0.03), 1)

    return {
        "age": age,
        "gender": "male",
        "height_cm": height,
        "current_weight_kg": weight,
        "target_weight_kg": weight,
        "goal": "maintenance",
        "activity_level": "sedentary",
        "target_calories": target_calories,
        "target_protein_g": protein,
        "target_fats_g": fats,
        "target_carbs_g": carbs,
        "target_water_l": water
    }

# ==========================================
# LIFESPAN & APP INIT
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        logger.info("Initializing BioNexus Server & Connecting to MongoDB Atlas...")
        await Database.connect_db()
        yield
    finally:
        logger.info("Shutting down BioNexus Server & Closing Database connections...")
        await Database.close_db()

app = FastAPI(title="BioNexus Core API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# MOUNT FRONTEND FILES & PAGE ROUTES
# ==========================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

@app.get("/", tags=["UI Routes"])
async def serve_intro(): return FileResponse(os.path.join(FRONTEND_DIR, "intro.html"))

@app.get("/login", tags=["UI Routes"])
async def serve_login(): return FileResponse(os.path.join(FRONTEND_DIR, "login.html"))

@app.get("/onboarding", tags=["UI Routes"])
async def serve_onboarding(): return FileResponse(os.path.join(FRONTEND_DIR, "onboarding.html"))

@app.get("/dashboard", tags=["UI Routes"])
async def serve_dashboard(): return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/profile", tags=["UI Routes"])
async def serve_profile(): return FileResponse(os.path.join(FRONTEND_DIR, "profile.html"))

@app.get("/workout", tags=["UI Routes"])
async def serve_workout(): return FileResponse(os.path.join(FRONTEND_DIR, "workout.html"))

@app.get("/stats", tags=["UI Routes"])
async def serve_stats(): return FileResponse(os.path.join(FRONTEND_DIR, "stats.html"))

@app.get("/diet", tags=["UI Routes"])
async def serve_diet(): return FileResponse(os.path.join(FRONTEND_DIR, "diet.html"))

@app.get("/settings", tags=["UI Routes"])
async def serve_settings(): return FileResponse(os.path.join(FRONTEND_DIR, "settings.html"))

# === NEW: Cyber-Doc AI UI Route ===
@app.get("/cyber-doc", tags=["UI Routes"])
async def serve_cyber_doc(): return FileResponse(os.path.join(FRONTEND_DIR, "cyber-doc.html"))

@app.get("/index.html", include_in_schema=False)
async def redirect_index_to_dashboard(): return RedirectResponse(url="/dashboard")

@app.get("/api/config", tags=["System"])
async def get_system_config(): return {"google_client_id": GOOGLE_CLIENT_ID}

# ==========================================
# AUTHENTICATION API ROUTES
# ==========================================
@app.post("/api/auth/register", tags=["Authentication"], response_model=TokenResponse)
async def register_user(user: UserRegister):
    db = Database.db
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered. Please login.")

    new_user = {
        "name": user.name,
        "email": user.email,
        "password_hash": get_password_hash(user.password),
        "auth_provider": "local",
        "is_onboarded": False,
        "created_at": datetime.utcnow().isoformat(),
        **get_default_macros()
    }
    await db.users.insert_one(new_user)
    
    token = create_access_token({"sub": user.email, "name": user.name})
    return {"access_token": token, "token_type": "bearer", "is_onboarded": False}

@app.post("/api/auth/login", tags=["Authentication"], response_model=TokenResponse)
async def login_user(user: UserLogin):
    db = Database.db
    db_user = await db.users.find_one({"email": user.email})
    
    if not db_user or db_user.get("auth_provider") != "local":
        raise HTTPException(status_code=401, detail="Invalid credentials or registered via Google.")
        
    if not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    if "target_calories" not in db_user:
        defaults = get_default_macros()
        await db.users.update_one({"email": user.email}, {"$set": defaults})

    is_onboarded = db_user.get("is_onboarded", False)
    db_user_name = db_user.get("name", "User")
    
    token = create_access_token({"sub": user.email, "name": db_user_name})
    return {"access_token": token, "token_type": "bearer", "is_onboarded": is_onboarded}

@app.get("/api/auth/google/login", tags=["Authentication"])
async def google_login():
    scope = "openid email profile"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"response_type=code&client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={REDIRECT_URI}&scope={scope}&access_type=offline"
    )
    return RedirectResponse(url=auth_url)

@app.get("/api/auth/google/callback", tags=["Authentication"])
async def google_callback(code: str):
    try:
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code"
        }
        
        async with httpx.AsyncClient() as client:
            token_res = await client.post(token_url, data=token_data)
            token_res_json = token_res.json()
            google_access_token = token_res_json.get("access_token")

            if not google_access_token:
                raise HTTPException(status_code=400, detail="Failed to get token from Google")

            user_info_url = "https://www.googleapis.com/oauth2/v3/userinfo"
            headers = {"Authorization": f"Bearer {google_access_token}"}
            user_info_res = await client.get(user_info_url, headers=headers)
            user_info = user_info_res.json()

        user_email = user_info.get("email")
        user_name = user_info.get("name", "User")
        profile_image = user_info.get("picture", "")

        db = Database.db
        db_user = await db.users.find_one({"email": user_email})

        if not db_user:
            new_user = {
                "name": user_name,
                "email": user_email,
                "profile_image": profile_image,
                "auth_provider": "google",
                "is_onboarded": False,
                "created_at": datetime.utcnow().isoformat(),
                **get_default_macros()
            }
            await db.users.insert_one(new_user)
            is_onboarded = False
            final_user_name = user_name
        else:
            update_fields = {}
            if profile_image:
                update_fields["profile_image"] = profile_image
            
            if "target_calories" not in db_user:
                update_fields.update(get_default_macros())
            
            if update_fields:
                await db.users.update_one({"email": user_email}, {"$set": update_fields})
            
            is_onboarded = db_user.get("is_onboarded", False)
            final_user_name = db_user.get("name", user_name)

        app_token = create_access_token({"sub": user_email, "name": final_user_name})
        
        if is_onboarded:
            return RedirectResponse(url=f"/dashboard?token={app_token}")
        else:
            return RedirectResponse(url=f"/onboarding?token={app_token}")

    except Exception as e:
        logger.error(f"Google OAuth Error: {e}")
        return RedirectResponse(url="/login?error=GoogleAuthFailed")

# ==========================================
# USER PROFILE API
# ==========================================
@app.get("/api/profile/{user_email}", tags=["User Profile"])
async def get_user_profile(user_email: str):
    try:
        db = Database.db
        user_data = await db.users.find_one({"email": user_email})
        
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found in system")
        
        if "target_calories" not in user_data:
            defaults = get_default_macros()
            await db.users.update_one({"email": user_email}, {"$set": defaults})
            user_data.update(defaults) 
        
        user_data.pop("_id", None)
        user_data.pop("password_hash", None)
        
        return {"status": "success", "data": user_data}
    except Exception as e:
        logger.error(f"Error fetching profile: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

# ==========================================
# ONBOARDING, MACROS & HEALTH ROUTES
# ==========================================
def calculate_macros(user: UserOnboarding):
    if user.gender.lower() == "male":
        bmr = (10 * user.current_weight_kg) + (6.25 * user.height_cm) - (5 * user.age) + 5
    else:
        bmr = (10 * user.current_weight_kg) + (6.25 * user.height_cm) - (5 * user.age) - 161

    activity_multipliers = {
        "sedentary": 1.2, "light": 1.375, "moderate": 1.55,
        "active": 1.725, "very_active": 1.9
    }
    multiplier = activity_multipliers.get(user.activity_level.lower(), 1.2)
    tdee = bmr * multiplier

    if user.goal == "weight_loss":
        target_calories = tdee - 500 
    elif user.goal == "muscle_gain":
        target_calories = tdee + 300 
    else:
        target_calories = tdee 

    protein = user.current_weight_kg * 2.2
    fats = (target_calories * 0.25) / 9
    carbs = (target_calories - (protein * 4) - (fats * 9)) / 4
    water = 2.5 + (user.current_weight_kg * 0.03)

    return {
        "target_calories": int(target_calories),
        "target_protein_g": int(protein),
        "target_fats_g": int(fats),
        "target_carbs_g": int(carbs),
        "target_water_l": round(water, 1)
    }

@app.post("/api/onboarding", tags=["User Profile"])
async def create_user_profile(user_data: UserOnboarding):
    try:
        db = Database.db
        calculated_macros = calculate_macros(user_data)
        full_profile = UserProfile(**user_data.model_dump(), **calculated_macros)
        profile_dict = full_profile.model_dump()
        
        # 🚨 ANTI-WIPE FIX: Prevent overwriting existing picture with empty data
        if "profile_image" in profile_dict and not profile_dict["profile_image"]:
            del profile_dict["profile_image"]
        
        await db.users.update_one(
            {"email": user_data.email},
            {"$set": {**profile_dict, "is_onboarded": True}}, 
            upsert=True
        )
        return {"status": "success", "profile": profile_dict}
    except Exception as e:
        logger.error(f"Error saving user profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to process onboarding data.")

@app.get("/api/health-log/{user_email}", tags=["Health Tracking"])
async def get_health_data(user_email: str, target_date: str):
    try:
        db = Database.db
        log_data = await db.health_logs.find_one({"user_email": user_email, "log_date": target_date})
        
        if log_data:
            log_data.pop("_id", None) 
            return {"status": "success", "data": log_data}
        else:
            return {"status": "success", "data": {"calories": 0, "water_liters": 0.0, "sleep_hours": 0.0, "steps": 0}}
    except Exception as e:
        logger.error(f"Failed to fetch health data: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error fetching health data.")

@app.post("/api/log-health", tags=["Health Tracking"])
async def log_health_data(log: DailyHealthLog):
    try:
        db = Database.db
        log_dict = log.model_dump()
        
        await db.health_logs.update_one(
            {"user_email": log.user_email, "log_date": log.log_date},
            {"$set": log_dict},
            upsert=True
        )
        
        ai_insight_text = get_health_insight(log.calories, log.water_liters, log.sleep_hours, log.steps)
        return {"status": "success", "data": log_dict, "ai_insight": ai_insight_text}
    except Exception as e:
        logger.error(f"Database error saving health log: {e}")
        raise HTTPException(status_code=500, detail="Failed to synchronize health data.")

@app.post("/api/chat", tags=["AI Assistant"])
async def ria_chat_engine(chat: ChatMessage):
    try:
        groq_api_key = os.environ.get("GROQ_API_KEY", "YOUR_GROQ_API_KEY_HERE") 
        if groq_api_key == "YOUR_GROQ_API_KEY_HERE":
            return {"status": "success", "reply": "My creator Anubhav hasn't inserted my API key yet! 🤖🔧"}

        client = AsyncGroq(api_key=groq_api_key)
        ria_persona = """You are RIA (Responsive Intelligent Assistant), an advanced, cute, and friendly AI health coach built by Anubhav. 
        Your job is to provide short, crisp, and highly personalized advice on diet, fitness, sleep, and lifestyle.
        Keep your tone warm, encouraging, slightly tech-savvy, and use relevant emojis. 
        Do not write overly long essays. Be concise and conversational."""

        chat_completion = await client.chat.completions.create(
            messages=[{"role": "system", "content": ria_persona}, {"role": "user", "content": chat.user_message}],
            model="llama-3.1-8b-instant", temperature=0.7, max_tokens=200
        )
        return {"status": "success", "reply": chat_completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"RIA AI Engine Error: {e}")
        raise HTTPException(status_code=500, detail="I am experiencing a temporary cognitive overload. Please try again! 🤯")

@app.post("/api/upload-image", tags=["User Profile"])
async def upload_profile_image(data: ImageUpdate):
    try:
        db = Database.db
        await db.users.update_one(
            {"email": data.user_email},
            {"$set": {"profile_image": data.image_base64}}
        )
        return {"status": "success", "message": "Image saved to Matrix."}
    except Exception as e:
        logger.error(f"Image Upload Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image")


# ==========================================
# IMPORT AND INCLUDE ADDITIONAL ROUTES
# ==========================================
app.include_router(workout_router, prefix="/api/workout", tags=["Workout System"])
app.include_router(stats_router, prefix="/api/stats", tags=["Statistics"])
app.include_router(diet_router, prefix="/api/diet", tags=["Diet System"])
app.include_router(settings_router, prefix="/api/settings", tags=["System Settings"])
# A new AI Doctor router has been added.
app.include_router(ai_router, prefix="/api/ai", tags=["Cyber Doc AI"])