import matplotlib
matplotlib.use('TkAgg')  # Force interactive backend
import numpy as np
import matplotlib.pyplot as plt
import pyaudio
from matplotlib.animation import FuncAnimation
from matplotlib.widgets import CheckButtons, TextBox
from matplotlib.patches import Rectangle

# Enable interactive mode
plt.ion()

# --- CONFIGURATION ---
CHUNK = 2048  # Increased for better frequency resolution
RATE = 44100
DEVICE_INDEX = None  # Set to specific device index if needed
UPDATE_INTERVAL = 30  # ms between updates

# --- PYAUDIO SETUP ---
p = pyaudio.PyAudio()

# Print available devices
print("Available Audio Devices:")
print("-" * 60)
for i in range(p.get_device_count()):
    dev = p.get_device_info_by_index(i)
    if dev['maxInputChannels'] > 0:
        print(f"Index {i}: {dev['name']}")
        print(f"  Max Input Channels: {dev['maxInputChannels']}")
        print(f"  Default Sample Rate: {dev['defaultSampleRate']}")
print("-" * 60)

# Open audio stream
try:
    stream = p.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=RATE,
        input=True,
        input_device_index=DEVICE_INDEX,
        frames_per_buffer=CHUNK,
        stream_callback=None
    )
    print(f"Stream opened successfully on device {DEVICE_INDEX or 'default'}")
    print(f"Stream is active: {stream.is_active()}")
except Exception as e:
    print(f"ERROR: Could not open stream: {e}")
    p.terminate()
    exit()

print("\nInitializing plot...")

# --- PLOT SETUP ---
fig = plt.figure(figsize=(14, 8))
fig.patch.set_facecolor('#0a0a0a')

# Create grid layout
gs = fig.add_gridspec(3, 4, height_ratios=[3, 1, 0.3], width_ratios=[3, 0.5, 0.5, 0.5],
                      hspace=0.3, wspace=0.3)

ax1 = fig.add_subplot(gs[0, :])  # Spectrum (full width)
ax2 = fig.add_subplot(gs[1, :])  # Waveform (full width)
ax_check = fig.add_subplot(gs[2, 0])  # Checkbox area
ax_note = fig.add_subplot(gs[2, 1:])  # Note display area

# Frequency spectrum plot
freqs = np.fft.rfftfreq(CHUNK, 1 / RATE)
mask = (freqs >= 20) & (freqs <= 20000)
freqs_plot = freqs[mask]

# --- MUSICAL NOTE MARKERS (Enhanced with gradients) ---
def midi_to_freq(midi_num):
    return 440.0 * (2.0 ** ((midi_num - 69) / 12.0))

def note_name(midi_num):
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    octave = (midi_num // 12) - 1
    note = notes[midi_num % 12]
    return f"{note}{octave}"

# Generate all notes from C2 to C8
note_bands = []
for midi in range(36, 97):  # C2 (36) to C8 (96)
    freq = midi_to_freq(midi)
    if 20 <= freq <= 20000:
        note_bands.append({
            'freq': freq,
            'name': note_name(midi),
            'midi': midi,
            'is_c': note_name(midi)[0] == 'C' and len(note_name(midi).split('#')) == 1  # Only C, not C#
        })

# Create gradient colors - cycle through hues for each octave
from matplotlib.colors import LinearSegmentedColormap
import matplotlib.patches as mpatches

# Draw note bands with subtle gradients
for i, note in enumerate(note_bands):
    freq = note['freq']
    
    # Calculate width to next note
    if i < len(note_bands) - 1:
        next_freq = note_bands[i + 1]['freq']
    else:
        next_freq = freq * 1.05946  # semitone ratio
    
    # Color scheme: alternate between octaves with subtle hues
    octave = note['midi'] // 12
    
    # Different colors for each octave (more vibrant)
    octave_colors = [
        ('#1a0a3a', '#2a1550'),  # Purple
        ('#0a1a3a', '#153050'),  # Blue
        ('#0a3a2a', '#154030'),  # Teal
        ('#2a3a0a', '#405015'),  # Green
        ('#3a2a0a', '#503515'),  # Orange
    ]
    
    color_pair = octave_colors[octave % len(octave_colors)]
    
    # Highlight C notes more prominently
    if note['is_c']:
        alpha = 0.4  # Much more visible
        color = color_pair[1]
    else:
        alpha = 0.25  # More visible
        color = color_pair[0]
    
    # Draw the band
    ax1.axvspan(freq, next_freq, alpha=alpha, color=color, zorder=0, linewidth=0)

# Add labels for C notes and A440
# Only label every other C note to avoid crowding, plus A440
label_notes = []
for note in note_bands:
    if note['is_c']:
        octave = note['midi'] // 12
        # Only show C2, C4, C6 (every other octave)
        if octave % 2 == 0:
            label_notes.append(note)
    elif note['name'] == 'A4':
        label_notes.append(note)

for note in label_notes:
    freq = note['freq']
    # Draw reference line
    ax1.axvline(freq, color='#505050', alpha=0.5, linewidth=0.7, linestyle=':', zorder=1)
    
    # Add label
    if note['is_c']:
        color = '#a0a0ff'
        fontsize = 9
        weight = 'bold'
    else:
        color = '#ffff80'
        fontsize = 8
        weight = 'normal'
    
    ax1.text(freq, -6, note['name'], rotation=0, ha='center', va='top', 
            fontsize=fontsize, color=color, alpha=0.9, weight=weight)

print("Note markers and gradients added...")

# Main spectrum line
line, = ax1.plot(freqs_plot, np.full_like(freqs_plot, -120.0), 
                 lw=1.5, color='#00ff41', alpha=0.9, label='Spectrum')

# Peak hold line
peak_line, = ax1.plot(freqs_plot, np.full_like(freqs_plot, -120.0),
                      lw=0.8, color='#ff0080', alpha=0.6, label='Peak Hold')

ax1.set_xlim(20, 20000)
ax1.set_ylim(-90, 0)
ax1.set_xscale('log')
ax1.set_facecolor('#0a0a0a')
ax1.set_xlabel('Frequency (Hz)', color='white', fontsize=11)
ax1.set_ylabel('Amplitude (dBFS)', color='white', fontsize=11)
ax1.grid(True, which='both', linestyle='--', alpha=0.2, color='gray')
ax1.legend(loc='upper right', facecolor='#1a1a1a', edgecolor='gray', 
          labelcolor='white', framealpha=0.8)
ax1.tick_params(colors='white')
ax1.spines['bottom'].set_color('white')
ax1.spines['left'].set_color('white')
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)

print("Spectrum plot configured...")

# Waveform plot
time_axis = np.linspace(0, CHUNK / RATE * 1000, CHUNK)
waveform, = ax2.plot(time_axis, np.zeros(CHUNK), lw=1, color='#00ccff')
ax2.set_xlim(0, CHUNK / RATE * 1000)
ax2.set_ylim(-1, 1)
ax2.set_facecolor('#0a0a0a')
ax2.set_xlabel('Time (ms)', color='white', fontsize=11)
ax2.set_ylabel('Amplitude', color='white', fontsize=11)
ax2.grid(True, alpha=0.2, color='gray')
ax2.tick_params(colors='white')
ax2.spines['bottom'].set_color('white')
ax2.spines['left'].set_color('white')
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)

print("Waveform plot configured...")

# --- CONTROLS SETUP ---
# Checkbox for noise gate
ax_check.set_facecolor('#0a0a0a')
ax_check.axis('off')

print("Setting up checkbox...")

check = CheckButtons(ax_check, ['Noise Gate'], [False])
check.labels[0].set_color('white')
check.labels[0].set_fontsize(10)

print("Checkbox created...")

# Note display box
ax_note.set_facecolor('#1a1a1a')
ax_note.set_xlim(0, 1)
ax_note.set_ylim(0, 1)
ax_note.axis('off')

note_text = ax_note.text(0.5, 0.5, 'No note detected', 
                         ha='center', va='center',
                         fontsize=14, color='#00ff41',
                         weight='bold', family='monospace')

print("Note display configured...")

# Control state
noise_gate_enabled = [False]  # Use list so it's mutable in nested function
noise_threshold = -60  # dBFS threshold for noise gate

def on_check_clicked(label):
    noise_gate_enabled[0] = not noise_gate_enabled[0]
    if noise_gate_enabled[0]:
        print("Noise gate enabled")
    else:
        print("Noise gate disabled")

check.on_clicked(on_check_clicked)

print("Controls setup complete...")

# Add title with real-time info
title = ax1.text(0.5, 1.05, 'Real-Time Audio Spectrum Analyzer', 
                transform=ax1.transAxes, ha='center', va='bottom',
                fontsize=14, color='white', weight='bold')

# --- DSP CONSTANTS ---
window = np.hanning(CHUNK).astype(np.float32)
coherent_gain = window.sum() / CHUNK
eps = 1e-12
alpha = 0.65  # Smoothing factor
smoothed_db = np.full_like(freqs_plot, -100.0)
peak_db = np.full_like(freqs_plot, -100.0)
peak_decay = 0.98  # Peak hold decay rate

# Frame counter
frame_count = 0

print("Starting animation setup...")

def animate(_):
    global smoothed_db, peak_db, frame_count
    
    try:
        # Read audio data
        available = stream.get_read_available()
        if available >= CHUNK:
            raw = stream.read(CHUNK, exception_on_overflow=False)
            y = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
            
            # Normalize
            y_norm = y / 32768.0
            
            # Update waveform
            waveform.set_ydata(y_norm)
            
            # Apply window
            y_win = y_norm * window
            
            # FFT
            fft = np.fft.rfft(y_win)
            mag = np.abs(fft) / (CHUNK * coherent_gain)
            
            # Convert to dBFS
            dbfs = 20 * np.log10(mag[mask] + eps)
            
            # Apply noise gate if enabled
            if noise_gate_enabled[0]:
                dbfs_gated = np.where(dbfs > noise_threshold, dbfs, -100.0)
                smoothed_db = alpha * smoothed_db + (1 - alpha) * dbfs_gated
            else:
                smoothed_db = alpha * smoothed_db + (1 - alpha) * dbfs
            
            # Update peak hold with decay
            peak_db = np.maximum(smoothed_db, peak_db * peak_decay)
            
            # Update plots
            line.set_ydata(smoothed_db)
            peak_line.set_ydata(peak_db)
            
            # Detect dominant note
            if noise_gate_enabled[0]:
                # Find peak frequency above threshold
                peak_idx = np.argmax(smoothed_db)
                peak_level = smoothed_db[peak_idx]
                
                if peak_level > noise_threshold:
                    peak_freq = freqs_plot[peak_idx]
                    
                    # Find closest note
                    closest_note = None
                    min_diff = float('inf')
                    
                    for note in note_bands:
                        diff = abs(note['freq'] - peak_freq)
                        if diff < min_diff:
                            min_diff = diff
                            closest_note = note
                    
                    if closest_note:
                        # Calculate cents off (for tuning reference)
                        cents = 1200 * np.log2(peak_freq / closest_note['freq'])
                        
                        # Format display text
                        note_str = f"{closest_note['name']}"
                        freq_str = f"{peak_freq:.1f} Hz"
                        cents_str = f"{cents:+.0f} cents"
                        
                        note_text.set_text(f"{note_str}  |  {freq_str}  |  {cents_str}")
                        
                        # Color based on how in-tune it is
                        if abs(cents) < 10:
                            note_text.set_color('#00ff41')  # Green - in tune
                        elif abs(cents) < 30:
                            note_text.set_color('#ffff00')  # Yellow - slightly off
                        else:
                            note_text.set_color('#ff8800')  # Orange - off tune
                else:
                    note_text.set_text('Below threshold')
                    note_text.set_color('#808080')
            else:
                note_text.set_text('Noise gate OFF')
                note_text.set_color('#606060')
            
            # Update title with peak level every 10 frames
            if frame_count % 10 == 0:
                peak_level = np.max(smoothed_db)
                title.set_text(f'Real-Time Audio Spectrum Analyzer | Peak: {peak_level:.1f} dBFS')
            
            frame_count += 1
            
    except Exception as e:
        print(f"Error in animation: {e}")
        
    return line, peak_line, waveform, title, note_text

# Create animation
print("Creating FuncAnimation object...")
ani = FuncAnimation(fig, animate, interval=UPDATE_INTERVAL, 
                   blit=True, cache_frame_data=False)

print("Animation created successfully!")

# Adjust layout to fit controls
plt.subplots_adjust(bottom=0.15)

try:
    print("\n" + "="*60)
    print("Starting visualization... Close the window to exit.")
    print("="*60 + "\n")
    plt.show(block=True)  # Force blocking
    print("\nWindow closed by user.")
except KeyboardInterrupt:
    print("\nInterrupted by user (Ctrl+C)")
except Exception as e:
    print(f"\nError during plt.show(): {e}")
    import traceback
    traceback.print_exc()
finally:
    print("\nCleaning up...")
    stream.stop_stream()
    stream.close()
    p.terminate()
    print("Done!")
