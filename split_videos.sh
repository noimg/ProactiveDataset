#!/usr/bin/env bash

# Split every video below Videos into five-minute segments.
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == '-h' || "${1:-}" == '--help' ]]; then
    cat <<'USAGE'
Usage: ./split_videos.sh [INPUT_DIR] [OUTPUT_DIR]

Split supported videos into five-minute segments. Defaults to ./Videos and
./Videos-processed relative to this script.
USAGE
    exit 0
fi

input_dir="${1:-${script_dir}/Videos-origin}"
output_dir="${2:-${script_dir}/Videos}"
segment_seconds=300

if ! command -v ffmpeg >/dev/null 2>&1; then
    printf 'Error: ffmpeg is required but was not found in PATH.\n' >&2
    exit 1
fi

if [[ ! -d "$input_dir" ]]; then
    printf 'Error: input directory does not exist: %s\n' "$input_dir" >&2
    exit 1
fi

mkdir -p "$output_dir"

find "$input_dir" -type f \( \
    -iname '*.mp4' -o -iname '*.webm' -o -iname '*.mkv' -o \
    -iname '*.mov' -o -iname '*.avi' -o -iname '*.ogv' -o \
    -iname '*.ogg' -o -iname '*.3gp' -o -iname '*.flv' -o \
    -iname '*.wmv' -o -iname '*.ts' -o -iname '*.m4v' \
\) -print0 |
while IFS= read -r -d '' input_file; do
    relative_file="${input_file#"$input_dir"/}"
    relative_dir="$(dirname -- "$relative_file")"
    filename="$(basename -- "$relative_file")"
    stem="${filename%.*}"
    extension="${filename##*.}"
    destination_dir="$output_dir/$relative_dir"
    mkdir -p "$destination_dir"

    # The segment muxer starts a new file at keyframes and preserves the source
    # codec, making this substantially faster than re-encoding every video.
    output_pattern="$destination_dir/${stem}-part%03d.${extension}"
    printf 'Processing: %s\n' "$input_file"
    ffmpeg -hide_banner -loglevel warning -nostdin -y \
        -i "$input_file" \
        -map 0 -c copy \
        -f segment -segment_time "$segment_seconds" -reset_timestamps 1 \
        "$output_pattern"
done
