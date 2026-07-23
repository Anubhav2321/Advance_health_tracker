// ==========================================
// BioNexus: Theme Loader (Runs BEFORE paint)
// Must be included in <head> of every page
// ==========================================
(function() {
    const root = document.documentElement;
    const savedMode = localStorage.getItem('bionexus_theme_mode') || 'dark';
    const savedAccent = localStorage.getItem('bionexus_theme_accent') || 'cyan';

    const accentMap = {
        cyan:   { hex: '#00f3ff', rgb: '0, 243, 255' },
        purple: { hex: '#a855f7', rgb: '168, 85, 247' },
        green:  { hex: '#22c55e', rgb: '34, 197, 94' },
        orange: { hex: '#f97316', rgb: '249, 115, 22' },
        pink:   { hex: '#ec4899', rgb: '236, 72, 153' },
        blue:   { hex: '#3b82f6', rgb: '59, 130, 246' }
    };

    // Resolve system mode
    let effectiveMode = savedMode;
    if (savedMode === 'system') {
        effectiveMode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    // Apply theme mode
    root.setAttribute('data-theme', effectiveMode);

    // Apply accent color
    const accent = accentMap[savedAccent] || accentMap.cyan;
    root.style.setProperty('--accent-color', accent.hex);
    root.style.setProperty('--accent-rgb', accent.rgb);
})();
