document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');
    const instrumentChoice = document.getElementById('instrumentChoice');
    const colorPicker = document.getElementById('colorPicker');
    const lineWidthInput = document.getElementById('lineWidth');
    const clearCanvasButton = document.getElementById('clearCanvas');
    const playSoundButton = document.getElementById('playSoundButton');
    const instrumentDescription = document.getElementById('instrumentDescription');

    const canvasWidth = Math.min(window.innerWidth - 40, 600);
    const canvasHeight = Math.min(window.innerHeight / 2, 400);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    let drawing = false;
    let currentColor = colorPicker.value;
    let currentLineWidth = lineWidthInput.value;
    let lastX = 0;
    let lastY = 0;
    let drawingData = [];
    let audioCtx = null;

    // Store preloaded piano samples if we were to implement that fully
    let pianoSamples = {}; // e.g., { "C4": audioBuffer, "A4": audioBuffer }
    let samplesLoaded = false;

    // --- Initialize Audio Context ---
    function initAudioContext() {
        if (!audioCtx || audioCtx.state === 'closed') {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                alert('Web Audio API is not supported in this browser.');
                console.error('Error initializing AudioContext:', e);
                return false;
            }
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(err => console.error("Error resuming AudioContext:", err));
        }
        return true;
    }

    // --- Drawing Logic (same as before) ---
    colorPicker.addEventListener('change', (e) => { currentColor = e.target.value; });
    lineWidthInput.addEventListener('change', (e) => { currentLineWidth = e.target.value; });

    function startDrawing(e) {
        if (!initAudioContext()) return;
        drawing = true;
        [lastX, lastY] = getPos(e);
    }

    function draw(e) {
        if (!drawing) return;
        const [currentX, currentY] = getPos(e);
        ctx.beginPath();
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentLineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
        ctx.closePath();
        drawingData.push({ x: lastX, y: lastY, newX: currentX, newY: currentY, color: currentColor, lineWidth: currentLineWidth });
        [lastX, lastY] = [currentX, currentY];
    }

    function stopDrawing() { if (drawing) drawing = false; }
    function getPos(event) { /* ... same as before ... */
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }
        return [clientX - rect.left, clientY - rect.top];
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); }, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
    canvas.addEventListener('touchcancel', stopDrawing);

    clearCanvasButton.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawingData = [];
        console.log('Canvas cleared');
    });

    instrumentChoice.addEventListener('change', (e) => {
        const selectedInstrument = e.target.value;
        let description = "";
        switch(selectedInstrument) {
            case "oscillator":
                description = "<p>基础波形: 红: 方波, 蓝: 锯齿波, 绿: 三角波, 其他: 正弦波</p>";
                break;
            case "musicBox":
                description = "<p>八音盒: 使用高频正弦波和快速衰减模拟。</p>";
                break;
            case "organ":
                description = "<p>管风琴 (简化): 通过混合多个基础波形产生更丰富的声音。</p>";
                break;
            case "piano":
                description = "<p>钢琴 (采样占位): 此模式需要钢琴音频样本才能正常工作。当前为占位符。</p>";
                // if (!samplesLoaded) loadPianoSamples(); // Example of when to load
                break;
        }
        instrumentDescription.innerHTML = description;
    });


    // --- Sound Generation Functions ---

    function playOscillatorSound(segment, playTime, frequency, volume, noteDuration) {
        let waveformType = 'sine';
        const hexColor = segment.color.toLowerCase();
        if (hexColor === '#ff0000') waveformType = 'square';
        else if (hexColor === '#0000ff') waveformType = 'sawtooth';
        else if (hexColor === '#008000') waveformType = 'triangle';

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = waveformType;
        oscillator.frequency.setValueAtTime(frequency, playTime);
        gainNode.gain.setValueAtTime(volume, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, playTime + noteDuration);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(playTime);
        oscillator.stop(playTime + noteDuration);
    }

    function playMusicBoxSound(segment, playTime, frequency, volume, noteDuration) {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'triangle'; // Triangle or sine can work well
        // Music boxes are often higher pitched
        oscillator.frequency.setValueAtTime(frequency * 2, playTime); // Shift up one octave

        // Music box envelope: quick attack, fairly quick decay
        gainNode.gain.setValueAtTime(volume * 0.8, playTime); // Start slightly less than full
        gainNode.gain.exponentialRampToValueAtTime(volume * 0.1, playTime + noteDuration * 0.5); // Faster decay
        gainNode.gain.exponentialRampToValueAtTime(0.001, playTime + noteDuration);


        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(playTime);
        oscillator.stop(playTime + noteDuration);
    }

    function playOrganSound(segment, playTime, frequency, volume, noteDuration) {
        const fundamentalGain = 0.4;
        const octaveGain = 0.3;
        const fifthGain = 0.2;

        // Create multiple oscillators for a richer organ sound (additive synthesis)
        const freqs = [
            frequency,         // Fundamental
            frequency * 2,     // Octave above
            frequency * 1.5    // Perfect fifth above (approx)
        ];
        const gains = [fundamentalGain, octaveGain, fifthGain];
        const types = ['sine', 'sine', 'sine']; // Can experiment with different waveforms

        const masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(volume, playTime);
        masterGain.gain.setValueAtTime(volume * 0.9, playTime + noteDuration * 0.8); // Slight decay for release
        masterGain.gain.exponentialRampToValueAtTime(0.001, playTime + noteDuration);
        masterGain.connect(audioCtx.destination);

        for (let i = 0; i < freqs.length; i++) {
            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain(); // Individual gain for each partial

            osc.type = types[i];
            osc.frequency.setValueAtTime(freqs[i], playTime);
            oscGain.gain.setValueAtTime(gains[i], playTime);

            osc.connect(oscGain);
            oscGain.connect(masterGain);

            osc.start(playTime);
            osc.stop(playTime + noteDuration);
        }
    }

    function playPianoSound(segment, playTime, frequency, volume, noteDuration) {
        // THIS IS A PLACEHOLDER. True piano sound requires samples.
        // If you had samples loaded into `pianoSamples`:
        /*
        if (samplesLoaded && Object.keys(pianoSamples).length > 0) {
            // Find the closest sample and adjust playback rate
            let closestSampleKey = findClosestPianoSample(frequency); // You'd need this function
            let sampleBuffer = pianoSamples[closestSampleKey.name];
            let playbackRate = frequency / closestSampleKey.freq;

            const source = audioCtx.createBufferSource();
            source.buffer = sampleBuffer;
            source.playbackRate.value = playbackRate;

            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(volume, playTime);
            // Piano envelope is complex, this is a simplification
            gainNode.gain.exponentialRampToValueAtTime(0.001, playTime + noteDuration * 1.5); // Longer decay for piano

            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            source.start(playTime);
            // source.stop(playTime + noteDuration * 1.5); // Buffer source stops when buffer ends or explicitly stopped.
            return;
        }
        */

        // Fallback to a basic synthesized sound if no samples
        console.warn("Piano samples not loaded. Using basic oscillator for piano sound.");
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'triangle'; // A slightly richer tone than sine
        oscillator.frequency.setValueAtTime(frequency, playTime);

        // Attempt a more percussive envelope
        gainNode.gain.setValueAtTime(volume, playTime);
        gainNode.gain.exponentialRampToValueAtTime(volume * 0.3, playTime + noteDuration * 0.2);
        gainNode.gain.exponentialRampToValueAtTime(volume * 0.1, playTime + noteDuration * 0.8);
        gainNode.gain.exponentialRampToValueAtTime(0.001, playTime + noteDuration);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(playTime);
        oscillator.stop(playTime + noteDuration * 1.2); // Slightly longer tail for "piano"
    }

    // --- Main Play Sound Logic ---
    playSoundButton.addEventListener('click', () => {
        if (!initAudioContext()) return;
        if (drawingData.length === 0) {
            alert('请先在画布上绘制一些图案！');
            return;
        }
        console.log('Playing sound based on drawing...');
        const playData = [...drawingData];
        let startTime = audioCtx.currentTime + 0.1;
        const baseNoteDuration = 0.20; // Increased base duration
        const timeStepIncrement = 0.08; // Slightly increased step

        const selectedInstrument = instrumentChoice.value;

        playData.forEach((segment, index) => {
            const midY = (segment.y + segment.newY) / 2;
            const minFreq = 100;
            const maxFreq = 1200;
            const normalizedY = 1 - (midY / canvas.height);
            let frequency = minFreq + normalizedY * (maxFreq - minFreq);
            frequency = Math.max(minFreq, Math.min(maxFreq, frequency));

            const playTime = startTime + index * timeStepIncrement;
            const volume = Math.min(1, 0.15 + (segment.lineWidth / 20) * 0.85); // Adjusted volume range
            const dx = segment.newX - segment.x;
            const dy = segment.newY - segment.y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);
            let noteDuration = baseNoteDuration + (segmentLength / 150) * 0.15; // Adjusted duration scaling


            try {
                switch (selectedInstrument) {
                    case 'musicBox':
                        noteDuration *= 0.8; // Music box notes are often shorter
                        playMusicBoxSound(segment, playTime, frequency, volume, noteDuration);
                        break;
                    case 'organ':
                        noteDuration *= 1.5; // Organ notes can be longer
                        playOrganSound(segment, playTime, frequency, volume, noteDuration);
                        break;
                    case 'piano':
                        noteDuration *= 1.2; // Piano notes might have a bit more sustain
                        playPianoSound(segment, playTime, frequency, volume, noteDuration);
                        break;
                    case 'oscillator':
                    default:
                        playOscillatorSound(segment, playTime, frequency, volume, noteDuration);
                        break;
                }
            } catch (err) {
                console.error("Error playing sound node:", err, { selectedInstrument, frequency, playTime, volume, noteDuration });
            }
        });
        console.log('Sound playback scheduled for ' + playData.length + ' segments.');
    });

    // --- Functions for Piano Sample Loading (Illustrative) ---
    // You would need actual audio files (e.g., .wav, .mp3) for this.
    async function loadPianoSample(url, noteName) {
        if (!audioCtx) initAudioContext();
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            pianoSamples[noteName] = audioBuffer;
            console.log(`Sample ${noteName} loaded from ${url}`);
        } catch (error) {
            console.error(`Error loading sample ${noteName} from ${url}:`, error);
        }
    }

    async function loadPianoSamples() {
        // Example: You would need to host these sample files somewhere accessible.
        // await loadPianoSample('path/to/piano_C4.wav', 'C4');
        // await loadPianoSample('path/to/piano_G4.wav', 'G4');
        // await loadPianoSample('path/to/piano_A4.wav', 'A4');
        // ... etc. for a range of notes
        samplesLoaded = true;
        console.log('All attempted piano samples processed.');
        // Update UI or enable piano features once samples are loaded
        if (instrumentChoice.value === "piano") {
             instrumentDescription.innerHTML = "<p>钢琴: 尝试加载样本。如果成功，将使用采样声音。否则为合成占位符。</p>";
        }
    }

    // Example to find the closest sample (very basic)
    function findClosestPianoSample(targetFrequency) {
        // This is a highly simplified example. Real samplers use more sophisticated mapping.
        // Assumes pianoSamples stores { "C4": { buffer: audioBuffer, freq: 261.63 }, ... }
        let closestKey = null;
        let minDiff = Infinity;

        // A very small, predefined map for demonstration
        const sampleMap = {
            "C4": { freq: 261.63, buffer: pianoSamples["C4"] }, // Assuming "C4" is a key in pianoSamples
            "G4": { freq: 392.00, buffer: pianoSamples["G4"] },
            "A4": { freq: 440.00, buffer: pianoSamples["A4"] }
        };


        for (const noteName in sampleMap) {
            if (sampleMap[noteName].buffer) { // Check if buffer actually loaded
                const diff = Math.abs(sampleMap[noteName].freq - targetFrequency);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestKey = { name: noteName, freq: sampleMap[noteName].freq, buffer: sampleMap[noteName].buffer };
                }
            }
        }
        // If no samples are loaded/available, you might return a default or handle it
        if (!closestKey && Object.keys(pianoSamples).length > 0) { // Fallback if specific notes aren't in sampleMap but others are
            const firstSampleKey = Object.keys(pianoSamples)[0];
             // This part is still conceptual as pianoSamples only stores buffers by note name directly
            // You'd need a more robust way to store and retrieve sample frequencies
            // For now, let's assume a default if the map fails but samples exist
            console.warn("Could not find specific sample via map, picking first available sample. Pitching will be less accurate.");
            return { name: firstSampleKey, freq: 261.63, buffer: pianoSamples[firstSampleKey] }; // Defaulting to C4-ish freq
        }

        return closestKey; // Might be null if no samples are loaded AT ALL
    }


    // Initialize instrument description
    instrumentChoice.dispatchEvent(new Event('change'));
});