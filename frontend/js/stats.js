// ==========================================
// BioNexus: Statistics Matrix Logic (Chart.js)
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Security Check
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

    const spinner = document.getElementById('loading-spinner');
    const content = document.getElementById('stats-content');

    // Chart.js Global Theme Defaults
    Chart.defaults.color = '#a0a6b1';
    Chart.defaults.font.family = 'Inter';

    try {
        // Fetch Real Weekly Data
        const response = await fetch(`/api/stats/weekly/${userEmail}`);
        const result = await response.json();

        if (response.ok && result.status === "success") {
            const data = result;
            
            // 1. Update Summary Cards
            document.getElementById('ui-streak').innerHTML = `${data.summary.active_streak} <i class="fa-solid fa-fire" style="color: #ff5e5e;"></i>`;
            document.getElementById('ui-avg-cal').innerText = data.summary.avg_calories;

            // 2. Render Calorie Line Chart (Cyberpunk Glowing Effect)
            const ctxCal = document.getElementById('calorieChart').getContext('2d');
            
            // Gradient Fill for Line Chart
            let gradientCal = ctxCal.createLinearGradient(0, 0, 0, 200);
            gradientCal.addColorStop(0, 'rgba(0, 243, 255, 0.4)');
            gradientCal.addColorStop(1, 'rgba(0, 243, 255, 0.0)');

            new Chart(ctxCal, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Calories Consumed',
                        data: data.charts.calories,
                        borderColor: '#00f3ff', // Cyber Cyan
                        backgroundColor: gradientCal,
                        borderWidth: 2,
                        pointBackgroundColor: '#00f3ff',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#00f3ff',
                        fill: true,
                        tension: 0.4 // Smooth curves
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                        x: { grid: { display: false } }
                    }
                }
            });

            // 3. Render Workout Volume Bar Chart (Neon Purple Effect)
            const ctxVol = document.getElementById('volumeChart').getContext('2d');
            
            new Chart(ctxVol, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Total Volume (Kg)',
                        data: data.charts.volume,
                        backgroundColor: '#9d4edd', // Neon Purple
                        borderRadius: 6,
                        hoverBackgroundColor: '#b668f8'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                        x: { grid: { display: false } }
                    }
                }
            });

            // Show Content
            spinner.style.display = 'none';
            content.style.display = 'flex';
        } else {
            throw new Error("Failed to load statistics");
        }
    } catch (error) {
        console.error("Stats Error:", error);
        spinner.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ff5e5e;"></i> Core Analysis Failed.';
    }
});