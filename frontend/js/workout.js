// ==========================================
// BioNexus: Workout Matrix Logic
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Security & Token Decode
    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) {
        window.location.href = '/login';
        return;
    }

    let userEmail = ""; 
    try {
        const payload = JSON.parse(atob(currentToken.split('.')[1]));
        if (payload.sub) userEmail = payload.sub;
    } catch (e) {
        localStorage.removeItem('bionexus_token');
        window.location.href = '/login';
        return;
    }

    // UI Elements
    const spinner = document.getElementById('loading-spinner');
    const content = document.getElementById('workout-content');
    const workoutList = document.getElementById('workout-list');
    const progressCircle = document.getElementById('progress-circle');
    const progressText = document.getElementById('progress-text');
    const completeBtn = document.getElementById('complete-btn');
    
    // Set Date
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const dateDisplay = document.getElementById('date-display');
    if(dateDisplay) dateDisplay.innerText = today;

    let totalSets = 0;
    let completedSets = 0;
    let workoutData = [];

    // 2. Fetch Workout Plan from Backend (Updated to handle saved state)
    async function loadWorkoutPlan() {
        try {
            const response = await fetch(`/api/workout/today/${userEmail}`);
            const result = await response.json();

            if (response.ok && result.status === "success") {
                workoutData = result.routine || [];
                
                // 💥 Smart Fallback - If database is empty, load a default routine for testing!
                if (workoutData.length === 0) {
                    workoutData = [
                        { name: "Cyber Pushups", muscle: "Chest & Triceps", sets: 3, reps: 15 },
                        { name: "Neon Squats", muscle: "Quads & Glutes", sets: 4, reps: 12 },
                        { name: "Matrix Pull-ups", muscle: "Back & Biceps", sets: 3, reps: 10 },
                        { name: "Holo Core Crunches", muscle: "Abs", sets: 3, reps: 20 }
                    ];
                    
                    // NEW: Initialize set_details for auto-save compatibility if it doesn't exist
                    workoutData.forEach(ex => {
                        if (!ex.set_details) {
                            ex.set_details = [];
                            for(let i = 0; i < ex.sets; i++) {
                                ex.set_details.push({ kg: 0, reps: ex.reps, completed: false });
                            }
                        }
                    });
                }
                
                renderWorkoutList(workoutData);
                updateProgress(); // Ensure progress matches loaded state
                
                spinner.style.display = 'none';
                content.style.display = 'flex';
            } else {
                throw new Error("Failed to load routine");
            }
        } catch (error) {
            console.error("Matrix Loading Error:", error);
            spinner.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ff5e5e;"></i> Failed to load Matrix. Check console.';
        }
    }

    loadWorkoutPlan();

    // 3. Render Accordion UI (Updated to load previous inputs dynamically)
    function renderWorkoutList(routines) {
        workoutList.innerHTML = '';
        totalSets = 0;
        completedSets = 0; // Reset for recalculation

        routines.forEach((exercise, exIndex) => {
            totalSets += exercise.sets;

            const card = document.createElement('div');
            card.classList.add('exercise-card');
            card.id = `ex-card-${exIndex}`;

            let headerHTML = `
                <div class="ex-header" onclick="toggleAccordion(${exIndex})">
                    <div class="ex-info">
                        <h4>${exercise.name}</h4>
                        <p><i class="fa-solid fa-dna"></i> Target: ${exercise.muscle}</p>
                    </div>
                    <div class="ex-toggle"><i class="fa-solid fa-chevron-down"></i></div>
                </div>
                <div class="ex-body">
            `;

            let setsArray = exercise.set_details || [];
            
            // Maintained your exact 1-based indexing loop
            for (let i = 1; i <= exercise.sets; i++) {
                let sIndex = i - 1; 
                let setDetail = setsArray[sIndex] || { kg: 0, reps: exercise.reps, completed: false };
                
                if (setDetail.completed) completedSets++;
                
                let isChecked = setDetail.completed ? 'checked' : '';
                let kgVal = setDetail.kg > 0 ? setDetail.kg : '';
                let repVal = setDetail.reps > 0 ? setDetail.reps : exercise.reps;

                headerHTML += `
                    <div class="set-row">
                        <div class="set-number">Set ${i}</div>
                        <div class="set-inputs">
                            <input type="number" id="ex${exIndex}-s${i}-kg" placeholder="Kg" value="${kgVal}" min="0" onblur="updateSetData(${exIndex}, ${i})">
                            <input type="number" id="ex${exIndex}-s${i}-rep" placeholder="Reps" value="${repVal}" min="1" onblur="updateSetData(${exIndex}, ${i})">
                            <div class="cyber-check ${isChecked}" id="check-${exIndex}-${i}" onclick="toggleSet(this, ${exIndex}, ${i})">
                                <i class="fa-solid fa-check"></i>
                            </div>
                        </div>
                    </div>
                `;
            }

            headerHTML += `</div>`;
            card.innerHTML = headerHTML;
            workoutList.appendChild(card);
            
            checkCardCompletion(exIndex);
        });
    }

    // 4. Accordion Toggle Logic (Intact)
    window.toggleAccordion = function(index) {
        const card = document.getElementById(`ex-card-${index}`);
        if(card) card.classList.toggle('active');
    };

    // NEW: Update Input Data & Auto-Save
    window.updateSetData = function(exIndex, i) {
        let sIndex = i - 1;
        let kg = parseFloat(document.getElementById(`ex${exIndex}-s${i}-kg`).value) || 0;
        let rep = parseInt(document.getElementById(`ex${exIndex}-s${i}-rep`).value) || 0;
        
        if(workoutData[exIndex] && workoutData[exIndex].set_details) {
            workoutData[exIndex].set_details[sIndex].kg = kg;
            workoutData[exIndex].set_details[sIndex].reps = rep;
        }
        autoSyncToDB();
    };

    // 5. Checkbox Logic & Progress Update (Integrated with Auto-Save)
    window.toggleSet = function(element, exIndex, i) {
        let sIndex = i - 1;
        element.classList.toggle('checked');
        
        let isCompleted = element.classList.contains('checked');
        
        if (isCompleted) {
            completedSets++;
        } else {
            completedSets--;
        }

        if(workoutData[exIndex] && workoutData[exIndex].set_details) {
            workoutData[exIndex].set_details[sIndex].completed = isCompleted;
            window.updateSetData(exIndex, i); // Force update inputs if typed
        }

        updateProgress();
        checkCardCompletion(exIndex);
        autoSyncToDB(); // BACKGROUND SYNC TRIGGER
    };

    function checkCardCompletion(exIndex) {
        const card = document.getElementById(`ex-card-${exIndex}`);
        if(!card) return;

        const allChecks = card.querySelectorAll('.cyber-check');
        let allDone = true;
        
        allChecks.forEach(check => {
            if (!check.classList.contains('checked')) allDone = false;
        });

        if (allDone) {
            card.classList.add('completed');
            card.classList.remove('active'); 
        } else {
            card.classList.remove('completed');
        }
    }

    function updateProgress() {
        if(totalSets === 0) return;
        const percentage = Math.round((completedSets / totalSets) * 100);
        progressText.innerText = `${percentage}%`;
        
        const offset = 408 - (408 * percentage) / 100;
        progressCircle.style.strokeDashoffset = offset;

        if (percentage === 100) {
            completeBtn.classList.add('ready');
            completeBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Complete Matrix';
        } else {
            completeBtn.classList.remove('ready');
            completeBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Sync Data';
        }
    }

    // NEW: Core Background Database Sync (Invisible to user)
    async function autoSyncToDB() {
        let totalVolume = 0;
        
        workoutData.forEach(ex => {
            if(ex.set_details) {
                ex.set_details.forEach(s => {
                    if (s.completed) {
                        totalVolume += (s.kg * s.reps);
                    }
                });
            }
        });

        const postData = {
            user_email: userEmail,
            date: new Date().toISOString().split('T')[0],
            exercises: workoutData,
            total_volume_kg: totalVolume
        };

        try {
            await fetch('/api/workout/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postData)
            });
        } catch (error) {
            console.error("Auto-Sync Failed:", error);
        }
    }

    // 6. Complete Workout Logic (Your exact logic maintained)
    if(completeBtn) {
        completeBtn.addEventListener('click', async () => {
            if (!completeBtn.classList.contains('ready')) return;

            completeBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing...';
            
            let finalLog = [];
            let totalVolume = 0;

            workoutData.forEach((exercise, exIndex) => {
                let totalExReps = 0;
                let totalExWeight = 0;

                for (let i = 1; i <= exercise.sets; i++) {
                    let weight = parseFloat(document.getElementById(`ex${exIndex}-s${i}-kg`).value) || 0;
                    let reps = parseInt(document.getElementById(`ex${exIndex}-s${i}-rep`).value) || 0;
                    
                    totalExReps += reps;
                    totalExWeight += (weight * reps); 
                }
                
                totalVolume += totalExWeight;
                
                finalLog.push({
                    name: exercise.name,
                    sets: exercise.sets,
                    reps: totalExReps,
                    weight_kg: totalExWeight 
                });
            });

            // Re-sync one final time to be absolutely sure
            await autoSyncToDB();

            // Original final click response preserved
            completeBtn.style.background = 'var(--accent-green)';
            completeBtn.style.borderColor = 'var(--accent-green)';
            completeBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Matrix Synced!';
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        });
    }
});