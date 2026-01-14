import numpy as np
import matplotlib.pyplot as plt
import pyaudio
from matplotlib.animation import FuncAnimation
from matplotlib.patches import Rectangle

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
except Exception as e:
    print(f"ERROR: Could not open stream: {e}")
    p.terminate()
    exit()

# --- PLOT SETUP ---
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8), 
                                gridspec_kw={'height_ratios': [3, 1]})
fig.patch.set_facecolor('#0a0a0a')

# Frequency spectrum plot
freqs = np.fft.rfftfreq(CHUNK, 1 / RATE)
mask = (freqs >= 20) & (freqs <= 20000)
freqs_plot = freqs[mask]

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
            
            # Smooth the spectrum
            smoothed_db = alpha * smoothed_db + (1 - alpha) * dbfs
            
            # Update peak hold with decay
            peak_db = np.maximum(smoothed_db, peak_db * peak_decay)
            
            # Update plots
            line.set_ydata(smoothed_db)
            peak_line.set_ydata(peak_db)
            
            # Update title with peak level every 10 frames
            if frame_count % 10 == 0:
                peak_level = np.max(smoothed_db)
                title.set_text(f'Real-Time Audio Spectrum Analyzer | Peak: {peak_level:.1f} dBFS')
            
            frame_count += 1
            
    except Exception as e:
        print(f"Error in animation: {e}")
        
    return line, peak_line, waveform, title

# Create animation
ani = FuncAnimation(fig, animate, interval=UPDATE_INTERVAL, 
                   blit=True, cache_frame_data=False)

plt.tight_layout()

try:
    print("\nStarting visualization... Close the window to exit.")
    plt.show()
finally:
    print("\nCleaning up...")
    stream.stop_stream()
    stream.close()
    p.terminate()
    print("Done!")
