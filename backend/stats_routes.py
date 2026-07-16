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
    Fetches the last 7 days of health and workout logs to generate real graph data.
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

        # 3. Format Data for the UI Charts
        calories_data = []
        steps_data = []
        volume_data = []
        water_data = []
        sleep_data = []
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
            
            calories_data.append(cal)
            steps_data.append(step)
            water_data.append(round(water, 1))
            sleep_data.append(round(sleep, 1))
            total_calories += cal
            total_sleep += sleep
            total_water += water
            
            if cal > best_day_cal:
                best_day_cal = cal
                best_day_label = date_str
            
            if cal > 0 or step > 0:
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
                "sleep": sleep_data
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