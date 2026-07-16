// ==========================================
// BioNexus: Matrix Analytics (Stats Page)
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {

    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) { window.location.href = '/login'; return; }

    let userEmail = "";
    try {
        const payload = JSON.parse(atob(currentToken.split('.')[1]));
        if (payload.sub) userEmail = payload.sub;
    } catch (e) { window.location.href = '/login'; return; }

    // Apply saved theme
    (function applyStoredTheme() {
        const root = document.documentElement;
        const savedMode = localStorage.getItem('bionexus_theme_mode') || 'dark';
        const savedAccent = localStorage.getItem('bionexus_theme_accent') || 'cyan';
        const accentMap = { cyan: '#00f3ff', purple: '#9d4edd', green: '#00ff87', orange: '#ff9d00' };
        if (accentMap[savedAccent]) {
            root.style.setProperty('--accent-cyan', savedAccent === 'cyan' ? '#00f3ff' : accentMap[savedAccent]);
        }
        if (savedMode === 'light') {
            root.style.setProperty('--bg-dark', '#f0f2f5');
            root.style.setProperty('--surface-dark', '#ffffff');
            root.style.setProperty('--text-primary', '#181b21');
            root.style.setProperty('--text-secondary', '#5a5f6b');
        }
    })();

    // Chart defaults
    Chart.defaults.color = '#a0a6b1';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Helper to create a gradient
    function createGradient(ctx, r, g, b) {
        const grad = ctx.createLinearGradient(0, 0, 0, 200);
        grad.addColorStop(0, `rgba(${r},${g},${b}, 0.4)`);
        grad.addColorStop(1, `rgba(${r},${g},${b}, 0.02)`);
        return grad;
    }

    // Common chart options
    const commonOptions = {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.04)' },
                ticks: { font: { size: 10 } }
            },
            x: {
                grid: { display: false },
                ticks: { font: { size: 10 } }
            }
        }
    };

    try {
        const res = await fetch(`/api/stats/weekly/${userEmail}`);
        const data = await res.json();

        if (data.status === "success") {
            const labels = data.labels;
            const charts = data.charts;
            const summary = data.summary;

            // Summary Cards
            document.getElementById('ui-streak').innerHTML = `${summary.active_streak} <i class="fa-solid fa-fire" style="color: #ff5e5e;"></i>`;
            document.getElementById('ui-avg-cal').innerText = summary.avg_calories;
            document.getElementById('ui-total-workouts').innerText = summary.total_workouts;
            document.getElementById('ui-avg-sleep').innerText = summary.avg_sleep;

            // 1. Calorie Chart
            const calCtx = document.getElementById('calorieChart').getContext('2d');
            new Chart(calCtx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Calories',
                        data: charts.calories,
                        borderColor: '#00f3ff',
                        backgroundColor: createGradient(calCtx, 0, 243, 255),
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#00f3ff',
                        borderWidth: 2
                    }]
                },
                options: commonOptions
            });

            // 2. Volume Chart
            const volCtx = document.getElementById('volumeChart').getContext('2d');
            new Chart(volCtx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Volume (Kg)',
                        data: charts.volume,
                        backgroundColor: 'rgba(157, 78, 221, 0.6)',
                        borderColor: '#9d4edd',
                        borderWidth: 1,
                        borderRadius: 6
                    }]
                },
                options: commonOptions
            });

            // 3. Steps Chart
            const stepsCtx = document.getElementById('stepsChart').getContext('2d');
            new Chart(stepsCtx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Steps',
                        data: charts.steps,
                        borderColor: '#00ff87',
                        backgroundColor: createGradient(stepsCtx, 0, 255, 135),
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#00ff87',
                        borderWidth: 2
                    }]
                },
                options: commonOptions
            });

            // 4. Sleep Chart
            const sleepCtx = document.getElementById('sleepChart').getContext('2d');
            new Chart(sleepCtx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Sleep (hrs)',
                        data: charts.sleep,
                        backgroundColor: 'rgba(192, 132, 252, 0.5)',
                        borderColor: '#c084fc',
                        borderWidth: 1,
                        borderRadius: 6
                    }]
                },
                options: commonOptions
            });

            // 5. Water Chart
            const waterCtx = document.getElementById('waterChart').getContext('2d');
            new Chart(waterCtx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Water (L)',
                        data: charts.water,
                        backgroundColor: 'rgba(56, 189, 248, 0.5)',
                        borderColor: '#38bdf8',
                        borderWidth: 1,
                        borderRadius: 6
                    }]
                },
                options: commonOptions
            });

            // Show content
            document.getElementById('loading-spinner').style.display = 'none';
            document.getElementById('stats-content').style.display = 'flex';

            // Refresh timestamp
            const now = new Date();
            document.getElementById('stats-refresh-time').innerText = `Last updated: ${now.toLocaleTimeString()}`;
        }
    } catch (error) {
        console.error('Stats fetch error:', error);
        document.getElementById('loading-spinner').innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Failed to load analytics';
    }
});