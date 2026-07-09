// ==========================================
// BioNexus: Onboarding & Data Collection
// ==========================================

// 💥 THE FIX: Secure JWT Parser (Handles Missing Padding Issues)
function parseJwt(token) {
    try {
        let base64Url = token.split('.')[1];
        let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) { base64 += '='; }
        let jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch(e) {
        return null;
    }
}

// Logic to capture and save the token from Google Auth.
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    
    if (urlToken) {
        localStorage.setItem('bionexus_token', urlToken);
        // Security: Hide the token from the URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Security Check: If no token is found, redirect to login page
    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) { 
        window.location.href = '/login'; 
    }
});

let currentStep = 1;
const totalSteps = 9;
const progressBar = document.getElementById('progress-bar');
const backBtn = document.getElementById('btn-back');

// Object to store all user answers
let userProfileData = {
    name: "",
    goal: "",
    activity_level: "", // Updated to match backend
    gender: "",
    age: 0,
    height_cm: 0,
    current_weight_kg: 0,
    target_weight_kg: 0,
    medical_conditions: []
};

/**
 * Update the UI to show the current step and progress bar
 */
function updateUI() {
    // Update Progress Bar
    const progress = (currentStep / totalSteps) * 100;
    if(progressBar) progressBar.style.width = `${progress}%`;

    // Show/Hide Back Button
    if (currentStep === 1) {
        if(backBtn) {
            backBtn.style.opacity = "0";
            backBtn.style.pointerEvents = "none";
        }
    } else {
        if(backBtn) {
            backBtn.style.opacity = "1";
            backBtn.style.pointerEvents = "auto";
        }
    }

    // Show current step content
    document.querySelectorAll('.step-section').forEach(section => {
        section.classList.remove('active');
        if (parseInt(section.getAttribute('data-step')) === currentStep) {
            section.classList.add('active');
        }
    });
}

/**
 * Standard Next Step (for manual inputs like Name, Age, Height)
 */
function nextStep() {
    // Validation for inputs before moving next
    if (currentStep === 1) userProfileData.name = document.getElementById('user-name').value;
    if (currentStep === 5) userProfileData.age = parseInt(document.getElementById('user-age').value) || 25;
    if (currentStep === 6) userProfileData.height_cm = parseFloat(document.getElementById('user-height').value) || 175;
    if (currentStep === 7) userProfileData.current_weight_kg = parseFloat(document.getElementById('user-weight').value) || 70;
    if (currentStep === 8) userProfileData.target_weight_kg = parseFloat(document.getElementById('user-target-weight').value) || 70;

    if (currentStep < totalSteps) {
        currentStep++;
        updateUI();
    }
}

/**
 * Auto-Advance Next Step (for Single Choice Options)
 */
function autoNextStep(key, value, element) {
    if(key === "activity") key = "activity_level"; // backend support
    
    // Save the data
    userProfileData[key] = value;

    // Visual selection effect
    const siblings = element.parentElement.querySelectorAll('.single-select');
    siblings.forEach(sib => sib.classList.remove('selected'));
    element.classList.add('selected');

    // Automatically go to next step after a tiny delay for smooth UX
    setTimeout(() => {
        if (currentStep < totalSteps) {
            currentStep++;
            updateUI();
        }
    }, 300);
}

/**
 * Handle Multi-Select Options (Medical Conditions)
 */
function toggleSelection(element, condition) {
    element.classList.toggle('selected');
    
    // Logic for "None" vs Others
    if (condition === "None" && element.classList.contains('selected')) {
        // If "None" is selected, deselect others
        userProfileData.medical_conditions = ["None"];
        const siblings = element.parentElement.querySelectorAll('.multi-select');
        siblings.forEach(sib => {
            if (sib !== element) sib.classList.remove('selected');
        });
    } else {
        // If something else is selected, remove "None"
        if (element.classList.contains('selected')) {
            userProfileData.medical_conditions.push(condition);
            // Remove 'None' visually and from array
            userProfileData.medical_conditions = userProfileData.medical_conditions.filter(item => item !== "None");
            const firstChild = document.querySelector('#medical-grid .multi-select:first-child');
            if(firstChild) firstChild.classList.remove('selected');
        } else {
            // Remove item if deselected
            userProfileData.medical_conditions = userProfileData.medical_conditions.filter(item => item !== condition);
        }
    }
}

/**
 * Back Button functionality
 */
if(backBtn) {
    backBtn.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateUI();
        } else {
            // If on step 1, go back to login screen
            window.location.href = "/login";
        }
    });
}

/**
 * Finish Onboarding & Send Data to Backend
 */
async function finishOnboarding() {
    console.log("Collected User Data: ", userProfileData);
    
    // 1. Show the full-screen AI animation
    const aiScreen = document.getElementById('ai-screen');
    if(aiScreen) aiScreen.classList.add('active');

    // 2. Decode email from token (USING THE FIX)
    const token = localStorage.getItem('bionexus_token');
    let userEmail = "";
    
    const payload = parseJwt(token);
    
    if (payload && payload.sub) {
        userEmail = payload.sub;
    } else {
        console.error("Token decoding failed.");
        if(aiScreen) aiScreen.classList.remove('active');
        return; // Stop execution if token is invalid
    }

    // 3. Prepare strict payload for FastAPI
    const payloadData = {
        email: userEmail,
        name: userProfileData.name || "User",
        goal: userProfileData.goal || "maintenance",
        activity_level: userProfileData.activity_level || "sedentary",
        gender: userProfileData.gender || "male",
        age: userProfileData.age || 25,
        height_cm: userProfileData.height_cm || 175,
        current_weight_kg: userProfileData.current_weight_kg || 70,
        target_weight_kg: userProfileData.target_weight_kg || 70
    };

    // 4. Send to Backend
    try {
        const response = await fetch('/api/onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadData)
        });
        
        if (response.ok) {
            // Wait a few seconds for cool AI animation, then go to dashboard
            setTimeout(() => {
                window.location.href = "/dashboard";
            }, 3500);
        } else {
            console.error("Failed to save data.");
            if(aiScreen) aiScreen.classList.remove('active');
            alert("Matrix sync failed. Try again.");
        }
    } catch(error) {
        console.error(error);
        if(aiScreen) aiScreen.classList.remove('active');
        alert("Network Error!");
    }
}

// Initialize first step
updateUI();