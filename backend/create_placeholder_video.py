import os
import subprocess
import imageio_ffmpeg

def generate_video():
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs('public/media', exist_ok=True)
    os.makedirs('media', exist_ok=True)
    output_path = 'public/media/kyogre-ocean-dive.mp4'

    # Filter with properly escaped text
    vf = (
        'drawtext=text=\'KYOGRE CINEMATIC DESCENT ENGINE\':x=(w-text_w)/2:y=120:fontsize=44:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=12,'
        'drawtext=text=\'TEMPORARY CALIBRATION PLACEHOLDER\':x=(w-text_w)/2:y=190:fontsize=24:fontcolor=0x00f0ff:box=1:boxcolor=black@0.8:boxborderw=8,'
        'drawtext=text=\'CANONICAL ASSET PATH - public/media/kyogre-ocean-dive.mp4\':x=(w-text_w)/2:y=240:fontsize=20:fontcolor=0x94a9be:box=1:boxcolor=black@0.8:boxborderw=8,'
        'drawtext=text=\'TIMECODE - %{pts\\:hms}\':x=(w-text_w)/2:y=h-160:fontsize=36:fontcolor=white:box=1:boxcolor=black@0.8:boxborderw=10,'
        'drawtext=text=\'STRATA DEPTH - %{eif\\:t*66.66\\:d} METERS\':x=(w-text_w)/2:y=h-100:fontsize=28:fontcolor=0x00f0ff:box=1:boxcolor=black@0.8:boxborderw=8'
    )

    cmd = [
        ffmpeg, '-y',
        '-f', 'lavfi', '-i', 'color=c=0x020a17:s=1920x1080:d=15:r=30',
        '-vf', vf,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '1', '-preset', 'ultrafast',
        output_path
    ]

    print("Running ffmpeg...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        size = os.path.getsize(output_path)
        print(f"Generated {output_path} ({size} bytes)")
        with open(output_path, 'rb') as f_src, open('media/kyogre-ocean-dive.mp4', 'wb') as f_dst:
            f_dst.write(f_src.read())
        print("Synchronized to media/kyogre-ocean-dive.mp4")
    else:
        print("FFmpeg failed:", res.stderr)

if __name__ == '__main__':
    generate_video()
