from fastapi import APIRouter, HTTPException
from typing import List, Dict
import logging
from datetime import datetime, timedelta
from backend.database import Database

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/weekly/{user_email}")
async def get_weekly_stats(user_email: str):
    """
    Fetches the last 7 days of health, workout, AND diet logs to generate real graph data.
    Now includes carbs, protein, and fats from the diet_logs collection.
    """
    try:
        db = Database.db
        
        # Calculate the date range for the last 7 days
        today = datetime.utcnow()
        date_labels = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
        
        # 1. Fetch Health Logs (Calories, Water, Sleep, Steps)
        health_cursor = db.health_logs.find({
            "user_email": user_email,
            "log_date": {"$in": date_labels}
        })
        health_logs = await health_cursor.to_list(length=7)
        health_dict = {log["log_date"]: log for log in health_logs}

        # 2. Fetch Workout Logs (Volume)
        workout_cursor = db.workout_logs.find({
            "user_email": user_email,
            "date": {"$in": date_labels}
        })
        workout_logs = await workout_cursor.to_list(length=7)
        workout_dict = {log["date"]: log for log in workout_logs}

        # 3. Fetch Diet Logs (Carbs, Protein, Fats) — NEW
        diet_cursor = db.diet_logs.find({
            "user_email": user_email,
            "date": {"$in": date_labels}
        })
        diet_logs = await diet_cursor.to_list(length=7)
        diet_dict = {log["date"]: log for log in diet_logs}

        # 4. Format Data for the UI Charts
        calories_data = []
        steps_data = []
        volume_data = []
        water_data = []
        sleep_data = []
        carbs_data = []
        protein_data = []
        fats_data = []
        streak_count = 0
        total_calories = 0
        total_sleep = 0
        total_water = 0
        total_workouts = 0
        best_day_cal = 0
        best_day_label = ""

        for date_str in date_labels:
            # Health Data
            h_log = health_dict.get(date_str, {})
            cal = h_log.get("calories", 0)
            step = h_log.get("steps", 0)
            water = h_log.get("water_liters", 0)
            sleep = h_log.get("sleep_hours", 0)
            
            # Diet Data (Macros) — NEW
            d_log = diet_dict.get(date_str, {})
            diet_cal = d_log.get("daily_total_calories", 0)
            carbs = d_log.get("daily_total_carbs", 0)
            protein = d_log.get("daily_total_protein", 0)
            fats = d_log.get("daily_total_fats", 0)
            
            # Use diet calories if available, else health log calories
            effective_cal = diet_cal if diet_cal > 0 else cal
            
            calories_data.append(effective_cal)
            steps_data.append(step)
            water_data.append(round(water, 1))
            sleep_data.append(round(sleep, 1))
            carbs_data.append(round(carbs, 1))
            protein_data.append(round(protein, 1))
            fats_data.append(round(fats, 1))
            
            total_calories += effective_cal
            total_sleep += sleep
            total_water += water
            
            if effective_cal > best_day_cal:
                best_day_cal = effective_cal
                best_day_label = date_str
            
            if effective_cal > 0 or step > 0:
                streak_count += 1
                
            # Workout Data
            w_log = workout_dict.get(date_str, {})
            volume_data.append(w_log.get("total_volume_kg", 0))
            if w_log.get("total_volume_kg", 0) > 0:
                total_workouts += 1

        # Format labels for UI (e.g., "Mon", "Tue")
        short_labels = [datetime.strptime(d, "%Y-%m-%d").strftime("%a") for d in date_labels]

        return {
            "status": "success",
            "labels": short_labels,
            "charts": {
                "calories": calories_data,
                "steps": steps_data,
                "volume": volume_data,
                "water": water_data,
                "sleep": sleep_data,
                "carbs": carbs_data,
                "protein": protein_data,
                "fats": fats_data
            },
            "summary": {
                "active_streak": streak_count,
                "avg_calories": round(total_calories / 7) if total_calories > 0 else 0,
                "avg_sleep": round(total_sleep / 7, 1) if total_sleep > 0 else 0,
                "total_workouts": total_workouts,
                "total_water": round(total_water, 1),
                "best_day": best_day_label
            }
        }

    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate matrix stats")