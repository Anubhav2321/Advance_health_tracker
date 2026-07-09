// ==========================================
// BioNexus: Backend API Configuration
// ==========================================

// Base URL for the FastAPI backend
const API_BASE_URL = "http://127.0.0.1:8000";

/**
 * Sends the user's daily health data to the backend,
 * triggers Groq AI analysis, and updates the UI.
 * @param {Object} healthData - The daily health metrics to send.
 */
async function syncHealthData(healthData) {
    try {
        // Show loading status in the AI insight banner
        const aiTextElement = document.getElementById('ai-quick-text');
        if (aiTextElement) {
            aiTextElement.innerText = "Analyzing data with Groq AI...";
        }

        // Send POST request to FastAPI backend
        const response = await fetch(`${API_BASE_URL}/api/log-health`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(healthData)
        });

        // Parse the JSON response
        const result = await response.json();

        // Handle validation errors (e.g., 422 Unprocessable Content)
        if (!response.ok) {
            console.error("Server Error Details:", result);
            throw new Error(`HTTP Error: ${response.status} - ${result.detail || "Validation Failed"}`);
        }

        console.log("Success! Server Response:", result);

        // Update the AI insight banner with Groq's response
        if (result.ai_insight && aiTextElement) {
            aiTextElement.innerText = result.ai_insight;
        }

        // Update the dashboard progress bars dynamically
        updateDashboardUI(result.data);

    } catch (error) {
        console.error("Data Sync Failed:", error);
        const aiTextElement = document.getElementById('ai-quick-text');
        if (aiTextElement) {
            aiTextElement.innerText = "Failed to fetch AI insights. Please check your connection.";
        }
    }
}

/**
 * Updates the dashboard metrics and progress bars based on the received data.
 * @param {Object} data - The validated data returned from the backend.
 */
function updateDashboardUI(data) {
    // Update Calories (Assuming target: 2500 kcal)
    if (document.getElementById('val-calories')) {
        document.getElementById('val-calories').innerText = data.calories.toLocaleString();
        let calPercent = Math.min((data.calories / 2500) * 100, 100);
        document.getElementById('prog-calories').style.width = `${calPercent}%`;
    }

    // Update Water Intake (Assuming target: 3.0 Liters)
    if (document.getElementById('val-water')) {
        document.getElementById('val-water').innerText = data.water_liters.toFixed(1);
        let waterPercent = Math.min((data.water_liters / 3.0) * 100, 100);
        document.getElementById('prog-water').style.width = `${waterPercent}%`;
    }

    // Update Sleep Duration (Assuming target: 8.0 Hours)
    if (document.getElementById('val-sleep')) {
        document.getElementById('val-sleep').innerText = data.sleep_hours.toFixed(1);
        let sleepPercent = Math.min((data.sleep_hours / 8.0) * 100, 100);
        document.getElementById('prog-sleep').style.width = `${sleepPercent}%`;
    }

    // Update Step Count (Assuming target: 10,000 Steps)
    if (document.getElementById('val-steps')) {
        document.getElementById('val-steps').innerText = data.steps.toLocaleString();
        let stepsPercent = Math.min((data.steps / 10000) * 100, 100);
        document.getElementById('prog-steps').style.width = `${stepsPercent}%`;
    }
}

// ==========================================
// App Initialization (Real Logic)
// ==========================================

// This email will eventually come from Firebase Google Login (auth.js)
const CURRENT_USER_EMAIL = "anubhavsamanta2005@gmail.com"; 

window.addEventListener('DOMContentLoaded', async () => {
    // 1. Set Real Current Date on the UI
    const dateElement = document.getElementById('current-date');
    const todayObj = new Date();
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    if (dateElement) {
        dateElement.innerText = todayObj.toLocaleDateString('en-US', options);
    }

    // Format date for Database query (YYYY-MM-DD format)
    const dbDateStr = todayObj.toISOString().split('T')[0];

    // 2. Fetch today's actual data from backend
    try {
        const response = await fetch(`${API_BASE_URL}/api/health-log/${CURRENT_USER_EMAIL}?target_date=${dbDateStr}`);
        
        if (response.ok) {
            const result = await response.json();
            
            // 3. Update the UI with real data (or 0s if nothing is logged yet)
            updateDashboardUI(result.data);
            
            // Note: We don't call Groq AI on initial load to save API tokens. 
            // AI will only trigger when the user actively logs new data.
            const aiTextElement = document.getElementById('ai-quick-text');
            if (aiTextElement) {
                aiTextElement.innerText = "Ready to analyze. Log your latest health data to get fresh AI insights.";
            }
        } else {
            console.warn("No previous data found for today or server error.");
        }
    } catch (error) {
        console.error("Error loading daily data:", error);
    }
});