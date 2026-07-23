// ==========================================
// BioNexus: Workout Engine (Modern Redesign)
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Security & Token Decode
    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) { window.location.href = '/login'; return; }

    let userEmail = ""; 
    try {
        let base64Url = currentToken.split('.')[1];
        let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) { base64 += '='; }
        const payload = JSON.parse(decodeURIComponent(window.atob(base64).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join('')));
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
    const progressTextEl = document.getElementById('progress-text');
    const completeBtn = document.getElementById('complete-btn');
    
    // Set Date
    const today = new Date();
    const dateDisplay = document.getElementById('date-display');
    if (dateDisplay) dateDisplay.innerText = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    let totalSets = 0;
    let completedSets = 0;
    let workoutData = [];
    let currentFilter = 'all';

    // Muscle group categorization
    const muscleCategories = {
        'chest': ['chest', 'pec'],
        'back': ['back', 'lat', 'trap', 'rhomboid'],
        'legs': ['quad', 'glute', 'hamstring', 'calf', 'leg'],
        'arms': ['bicep', 'tricep', 'arm', 'forearm', 'shoulder', 'delt'],
        'abs': ['ab', 'core', 'oblique']
    };

    function getExerciseCategory(muscle) {
        const m = muscle.toLowerCase();
        for (const [category, keywords] of Object.entries(muscleCategories)) {
            if (keywords.some(k => m.includes(k))) return category;
        }
        return 'other';
    }

    function getDifficultyLevel(exercise) {
        const name = exercise.name.toLowerCase();
        if (name.includes('deadlift') || name.includes('pull-up') || name.includes('squat')) return 3;
        if (name.includes('press') || name.includes('row') || name.includes('lunge')) return 2;
        return 1;
    }

    // ==========================================
    // 2. FETCH WORKOUT PLAN
    // ==========================================
    async function loadWorkoutPlan() {
        try {
            const response = await fetch(`/api/workout/today/${userEmail}`);
            const result = await response.json();

            if (response.ok && result.status === "success") {
                workoutData = result.routine || [];
                
                if (workoutData.length === 0) {
                    workoutData = [
                        { name: "Bench Press", muscle: "Chest & Triceps", sets: 4, reps: 10 },
                        { name: "Barbell Squats", muscle: "Quads & Glutes", sets: 4, reps: 12 },
                        { name: "Deadlifts", muscle: "Back & Hamstrings", sets: 3, reps: 8 },
                        { name: "Pull-ups", muscle: "Back & Biceps", sets: 3, reps: 10 },
                        { name: "Overhead Press", muscle: "Shoulders & Triceps", sets: 3, reps: 10 },
                        { name: "Plank Hold", muscle: "Core & Abs", sets: 3, reps: 45 },
                        { name: "Lunges", muscle: "Legs & Glutes", sets: 3, reps: 12 },
                        { name: "Bicep Curls", muscle: "Biceps & Arms", sets: 3, reps: 12 }
                    ];
                    
                    workoutData.forEach(ex => {
                        if (!ex.set_details) {
                            ex.set_details = [];
                            for (let i = 0; i < ex.sets; i++) {
                                ex.set_details.push({ kg: 0, reps: ex.reps, completed: false });
                            }
                        }
                    });
                }
                
                renderWorkoutList(workoutData);
                updateProgress();
                updateStats();
                
                spinner.style.display = 'none';
                content.style.display = 'flex';
            } else {
                throw new Error("Failed to load routine");
            }
        } catch (error) {
            console.error("Workout Loading Error:", error);
            spinner.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger-red);"></i> Failed to load workout.';
        }
    }

    loadWorkoutPlan();

    // ==========================================
    // 3. RENDER EXERCISE LIST
    // ==========================================
    function renderWorkoutList(routines) {
        workoutList.innerHTML = '';
        totalSets = 0;
        completedSets = 0;

        routines.forEach((exercise, exIndex) => {
            const category = getExerciseCategory(exercise.muscle);
            
            // Apply filter
            if (currentFilter !== 'all' && category !== currentFilter) return;

            totalSets += exercise.sets;
            const difficulty = getDifficultyLevel(exercise);

            const card = document.createElement('div');
            card.classList.add('exercise-card');
            card.id = `ex-card-${exIndex}`;
            card.dataset.category = category;

            let difficultyDots = '';
            for (let d = 1; d <= 3; d++) {
                difficultyDots += `<span class="${d <= difficulty ? 'filled' : ''}"></span>`;
            }

            let headerHTML = `
                <div class="ex-header" onclick="toggleAccordion(${exIndex})">
                    <div class="ex-info">
                        <h4>${exercise.name}</h4>
                        <div class="ex-meta">
                            <span class="muscle-badge">${exercise.muscle}</span>
                            <div class="difficulty-dots">${difficultyDots}</div>
                        </div>
                    </div>
                    <div class="ex-toggle"><i class="fa-solid fa-chevron-down"></i></div>
                </div>
                <div class="ex-body">
            `;

            let setsArray = exercise.set_details || [];
            
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

        // Update exercise count in stats
        document.getElementById('stat-exercises').textContent = routines.length;
    }

    // ==========================================
    // 4. ACCORDION & CHECKBOX LOGIC
    // ==========================================
    window.toggleAccordion = function(index) {
        const card = document.getElementById(`ex-card-${index}`);
        if (card) card.classList.toggle('active');
    };

    window.updateSetData = function(exIndex, i) {
        let sIndex = i - 1;
        let kgEl = document.getElementById(`ex${exIndex}-s${i}-kg`);
        let repEl = document.getElementById(`ex${exIndex}-s${i}-rep`);
        if (!kgEl || !repEl) return;
        
        let kg = parseFloat(kgEl.value) || 0;
        let rep = parseInt(repEl.value) || 0;
        
        if (workoutData[exIndex] && workoutData[exIndex].set_details) {
            workoutData[exIndex].set_details[sIndex].kg = kg;
            workoutData[exIndex].set_details[sIndex].reps = rep;
        }
        updateStats();
        autoSyncToDB();
    };

    window.toggleSet = function(element, exIndex, i) {
        let sIndex = i - 1;
        element.classList.toggle('checked');
        
        let isCompleted = element.classList.contains('checked');
        
        if (isCompleted) completedSets++;
        else completedSets--;

        if (workoutData[exIndex] && workoutData[exIndex].set_details) {
            workoutData[exIndex].set_details[sIndex].completed = isCompleted;
            window.updateSetData(exIndex, i);
        }

        updateProgress();
        checkCardCompletion(exIndex);
        updateStats();
        autoSyncToDB();
    };

    function checkCardCompletion(exIndex) {
        const card = document.getElementById(`ex-card-${exIndex}`);
        if (!card) return;

        const allChecks = card.querySelectorAll('.cyber-check');
        let allDone = allChecks.length > 0;
        
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
        if (totalSets === 0) return;
        const percentage = Math.round((completedSets / totalSets) * 100);
        progressTextEl.innerText = `${percentage}%`;
        
        const offset = 408 - (408 * percentage) / 100;
        progressCircle.style.strokeDashoffset = offset;

        if (percentage === 100) {
            completeBtn.classList.add('ready');
            completeBtn.innerHTML = '<i class="fa-solid fa-trophy"></i> Complete Workout';
        } else {
            completeBtn.classList.remove('ready');
            completeBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Complete Workout';
        }
    }

    function updateStats() {
        let totalVolume = 0;
        workoutData.forEach(ex => {
            if (ex.set_details) {
                ex.set_details.forEach(s => {
                    if (s.completed) {
                        totalVolume += (s.kg * s.reps);
                    }
                });
            }
        });

        document.getElementById('stat-volume').innerHTML = `${Math.round(totalVolume)}<small style="font-size: 0.7rem; color: var(--text-secondary);">kg</small>`;
        
        // Estimate calories: ~0.05 kcal per kg lifted (rough)
        const estCalories = Math.round(totalVolume * 0.05) + Math.round(completedSets * 5);
        document.getElementById('stat-calories').textContent = estCalories;
    }

    // ==========================================
    // 5. FILTER TABS
    // ==========================================
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderWorkoutList(workoutData);
            updateProgress();
        });
    });

    // ==========================================
    // 6. REST TIMER
    // ==========================================
    let timerSeconds = 90;
    let timerInterval = null;
    let timerRunning = false;
    const timerDisplay = document.getElementById('timer-display');
    const timerWidget = document.getElementById('rest-timer');
    const timerStartBtn = document.getElementById('timer-start-btn');

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function updateTimerDisplay() {
        if (timerDisplay) timerDisplay.textContent = formatTime(timerSeconds);
    }

    window.adjustTimer = function(delta) {
        if (timerRunning) return;
        timerSeconds = Math.max(15, Math.min(300, timerSeconds + delta));
        updateTimerDisplay();
    };

    document.getElementById('rest-timer-btn').addEventListener('click', () => {
        timerWidget.classList.toggle('active');
        updateTimerDisplay();
    });

    if (timerStartBtn) {
        timerStartBtn.addEventListener('click', () => {
            if (timerRunning) {
                // Stop
                clearInterval(timerInterval);
                timerRunning = false;
                timerStartBtn.textContent = 'Start';
                timerSeconds = 90;
                updateTimerDisplay();
            } else {
                // Start
                timerRunning = true;
                timerStartBtn.textContent = 'Stop';
                let remaining = timerSeconds;
                
                timerInterval = setInterval(() => {
                    remaining--;
                    timerDisplay.textContent = formatTime(remaining);
                    
                    if (remaining <= 0) {
                        clearInterval(timerInterval);
                        timerRunning = false;
                        timerStartBtn.textContent = 'Start';
                        timerDisplay.textContent = '0:00';
                        
                        // Flash effect
                        timerDisplay.style.color = 'var(--accent-green)';
                        setTimeout(() => {
                            timerDisplay.style.color = '';
                            timerSeconds = 90;
                            updateTimerDisplay();
                        }, 2000);
                    }
                }, 1000);
            }
        });
    }

    // ==========================================
    // 7. AI GENERATE ROUTINE
    // ==========================================
    document.getElementById('ai-generate-btn').addEventListener('click', async () => {
        const btn = document.getElementById('ai-generate-btn');
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';
        
        try {
            const res = await fetch('/api/workout/generate-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: userEmail,
                    target_muscle: 'full body',
                    fitness_level: 'intermediate'
                })
            });
            
            const data = await res.json();
            
            if (data.status === 'success' && data.ai_routine) {
                alert('AI Routine Generated!\n\n' + data.ai_routine);
            } else {
                alert(data.message || 'AI is currently offline. Using default routine.');
            }
        } catch (error) {
            alert('Failed to connect to AI engine.');
        }
        
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI Generate';
    });

    // ==========================================
    // 8. RESET WORKOUT
    // ==========================================
    document.getElementById('reset-workout-btn').addEventListener('click', async () => {
        if (!confirm('Reset all workout progress for today?')) return;
        
        try {
            await fetch('/api/workout/reset', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail })
            });
            
            window.location.reload();
        } catch (error) {
            alert('Failed to reset workout.');
        }
    });

    // ==========================================
    // 9. AUTO-SYNC TO DATABASE
    // ==========================================
    async function autoSyncToDB() {
        let totalVolume = 0;
        
        workoutData.forEach(ex => {
            if (ex.set_details) {
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

    // ==========================================
    // 10. COMPLETE WORKOUT
    // ==========================================
    if (completeBtn) {
        completeBtn.addEventListener('click', async () => {
            if (!completeBtn.classList.contains('ready')) return;

            completeBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing...';
            
            await autoSyncToDB();

            completeBtn.style.background = 'var(--accent-green)';
            completeBtn.style.borderColor = 'var(--accent-green)';
            completeBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Workout Complete!';
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        });
    }
});