#!/usr/bin/env python3
"""
AiM MyChron 5 XRK File Parser
Extracts session metadata, lap times, and channel data from .xrk files.

Usage:
    python3 xrk-parser.py <file.xrk> [file2.xrk ...]
    python3 xrk-parser.py /path/to/folder/   (processes all .xrk files in folder)

Output: Prints to console and saves a .json alongside each .xrk file.
"""

import struct
import sys
import os
import json
import re
from pathlib import Path


# ---------------------------------------------------------------------------
# Low-level block reader
# ---------------------------------------------------------------------------

def read_tag_string(data: bytes, pos: int) -> tuple[str, bytes, int]:
    """
    Read a tagged block from the XRK binary stream.

    Header blocks  : <hXXX\x00 + uint32 length + 2-byte sep + payload
    Data blocks    : <XXX\x00  + uint16 length + \x3e       + payload

    Returns (tag, payload, next_pos).
    """
    if data[pos:pos+1] != b'<':
        return None, None, pos + 1

    # Find the tag name (between '<' and '\x00' or ' ')
    end = pos + 1
    while end < len(data) and data[end] not in (0x00, 0x20) and end - pos < 12:
        end += 1
    tag = data[pos+1:end].decode('ascii', errors='replace')

    pad_pos = end        # either \x00 or space
    len_pos = pad_pos + 1

    if tag.startswith('h'):
        # Header block: 4-byte LE length
        if len_pos + 4 > len(data):
            return None, None, pos + 1
        length = struct.unpack_from('<I', data, len_pos)[0]
        payload_start = len_pos + 4 + 2   # skip length + 2-byte separator
    else:
        # Data block: 2-byte LE length
        if len_pos + 2 > len(data):
            return None, None, pos + 1
        length = struct.unpack_from('<H', data, len_pos)[0]
        payload_start = len_pos + 2 + 1   # skip length + 1-byte separator (0x3e)

    payload = data[payload_start: payload_start + length]
    next_pos = payload_start + length
    return tag, payload, next_pos


# ---------------------------------------------------------------------------
# Metadata extractors
# ---------------------------------------------------------------------------

def extract_tagged_string(data: bytes, open_tag: bytes, close_tag: bytes) -> str:
    """Extract UTF-8 content between open '>' and close '<' for a known tag."""
    start = data.find(open_tag)
    if start == -1:
        return ''
    start += len(open_tag)
    end = data.find(close_tag, start)
    if end == -1:
        end = start + 256
    raw = data[start:end]
    return raw.rstrip(b'\x00').decode('utf-8', errors='replace').strip()


def parse_metadata(data: bytes) -> dict:
    """Parse session-level metadata from the XRK binary."""
    meta = {}

    # Date:  <hTMD\x00 ... >YYYY/MM/DD\x00 <TMD
    meta['date']    = extract_tagged_string(data, b'>05/', b'<TMD')  # fallback
    # Use a smarter regex instead
    m = re.search(rb'<hTMD[^\x3e]+\x3e([^\x00<]+)', data)
    if m:
        meta['date'] = m.group(1).decode('ascii', errors='replace').strip()

    m = re.search(rb'<hTMT[^\x3e]+\x3e([^\x00<]+)', data)
    if m:
        meta['time'] = m.group(1).decode('ascii', errors='replace').strip()

    m = re.search(rb'<hTRK[^\x3e]+\x3e([^\x00<]{2,64})', data)
    if m:
        meta['track'] = m.group(1).rstrip(b'\x00').decode('utf-8', errors='replace').strip()

    m = re.search(rb'<hPDLT[^\x3e]+\x3e([^\x00<]+)', data)
    if m:
        meta['session_type'] = m.group(1).rstrip(b'\x00').decode('utf-8', errors='replace').strip()

    m = re.search(rb'<hRACM[^\x3e]+\x3e([^\x00<]+)', data)
    if m:
        meta['race_mode'] = m.group(1).rstrip(b'\x00').decode('utf-8', errors='replace').strip()

    # Competitor / driver name (stored in <hNDV> or nearby)
    m = re.search(rb'<hNDV[^\x3e]+\x3e([^\x00<]{2,64})', data)
    if m:
        name = m.group(1).rstrip(b'\x00').decode('utf-8', errors='replace').strip()
        if name:
            meta['driver'] = name

    # Vehicle / championship / vehicle type
    m = re.search(rb'<hVEH[^\x3e]+\x3e([^\x00<]{2,64})', data)
    if m:
        v = m.group(1).rstrip(b'\x00').decode('utf-8', errors='replace').strip()
        if v:
            meta['vehicle'] = v

    m = re.search(rb'<hCMP[^\x3e]+\x3e([^\x00<]{2,64})', data)
    if m:
        c = m.group(1).rstrip(b'\x00').decode('utf-8', errors='replace').strip()
        if c:
            meta['championship'] = c

    m = re.search(rb'<hVTY[^\x3e]+\x3e([^\x00<]{2,64})', data)
    if m:
        vt = m.group(1).rstrip(b'\x00').decode('utf-8', errors='replace').strip()
        if vt:
            meta['vehicle_type'] = vt

    # Hardware info (device firmware / type)
    m = re.search(rb'<hHWNF5[^\x3e]+\x3e([^\x00<]{4,128})', data)
    if m:
        meta['hardware'] = m.group(1).rstrip(b'\x00').decode('ascii', errors='replace').strip()

    return meta


# ---------------------------------------------------------------------------
# Lap time parser
# ---------------------------------------------------------------------------

def parse_laps(data: bytes) -> list[dict]:
    """
    Parse all <hLAP blocks.

    Payload layout (20 bytes):
      [0-1]  flags / type  (0xf1 0x00)
      [2-3]  lap number    uint16 LE
      [4-7]  lap duration  uint32 LE  (milliseconds)
      [8-15] unknown
      [16-19] cumulative session time at lap end  uint32 LE  (milliseconds)
    """
    laps = []
    pos = 0
    while True:
        pos = data.find(b'<hLAP', pos)
        if pos == -1:
            break

        payload_start = pos + 12   # 5-tag + 1-pad + 4-len + 2-sep
        if payload_start + 20 > len(data):
            pos += 1
            continue

        payload = data[payload_start: payload_start + 20]
        lap_num   = struct.unpack_from('<H', payload, 2)[0]
        dur_ms    = struct.unpack_from('<I', payload, 4)[0]
        cum_end   = struct.unpack_from('<I', payload, 16)[0]

        laps.append({
            'lap': lap_num,
            'duration_ms': dur_ms,
            'start_ms': cum_end - dur_ms,
            'end_ms': cum_end,
        })
        pos += 1

    # Sort by lap number
    laps.sort(key=lambda x: x['lap'])
    return laps


def format_laptime(ms: int) -> str:
    """Format milliseconds as M:SS.mmm"""
    sign = '-' if ms < 0 else ''
    ms = abs(ms)
    minutes = ms // 60000
    seconds = (ms % 60000) / 1000.0
    return f"{sign}{minutes}:{seconds:06.3f}"


def annotate_laps(laps: list[dict]) -> list[dict]:
    """
    Add derived fields: formatted time, gap to best, is_best flag.
    The last lap is marked as partial if it's significantly shorter than others.
    """
    if not laps:
        return laps

    # Identify complete laps (not the first or last which may be partial)
    # A lap is "partial" if it's less than 30% of the median lap time
    complete = laps[1:-1] if len(laps) > 2 else laps
    if complete:
        durations = sorted(l['duration_ms'] for l in complete)
        median = durations[len(durations)//2]
        partial_threshold = median * 0.7
    else:
        partial_threshold = 0

    best_ms = min((l['duration_ms'] for l in laps
                   if l['duration_ms'] > partial_threshold), default=0)

    for l in laps:
        l['time_formatted'] = format_laptime(l['duration_ms'])
        l['partial'] = l['duration_ms'] < partial_threshold
        if not l['partial']:
            l['gap_to_best_ms'] = l['duration_ms'] - best_ms
            l['gap_to_best'] = ('+' if l['gap_to_best_ms'] >= 0 else '') + \
                                format_laptime(l['gap_to_best_ms'])
            l['is_best'] = l['duration_ms'] == best_ms
        else:
            l['gap_to_best_ms'] = None
            l['gap_to_best'] = None
            l['is_best'] = False

    return laps


# ---------------------------------------------------------------------------
# Channel list extractor (bonus - list all available data channels)
# ---------------------------------------------------------------------------

def parse_channels(data: bytes) -> list[dict]:
    """
    Parse <hCHS channel header blocks to get the list of recorded channels.

    Verified payload layout (112 bytes after the 12-byte block header):
      [0-1]   channel index  (LE uint16)
      [2-23]  various flags/type fields
      [24-31] short name     (8 bytes, null-terminated ASCII)
      [32-55] long name      (24 bytes, null-terminated UTF-8)
      [56-59] sample rate    (LE uint32, Hz; 0 = event-driven)
      [60-111] AIM-internal fields (min/max, scale, offset, units…)
    """
    channels = []
    seen_indices = set()
    pos = 0
    while True:
        pos = data.find(b'<hCHS', pos)
        if pos == -1:
            break

        # payload_start after: <hCHS + \x00 + uint32_len + 2-byte sep = 12 bytes
        payload_start = pos + 12
        if payload_start + 112 > len(data):
            pos += 1
            continue

        p = data[payload_start: payload_start + 112]

        ch_idx      = struct.unpack_from('<H', p, 0)[0]
        sample_rate = struct.unpack_from('<I', p, 64)[0]
        short_name  = p[24:32].split(b'\x00')[0].decode('ascii', errors='replace').strip()
        long_name   = p[32:56].split(b'\x00')[0].decode('utf-8', errors='replace').strip()

        # Skip duplicates and entries with no printable name
        if short_name and ch_idx not in seen_indices:
            seen_indices.add(ch_idx)
            channels.append({
                'index': ch_idx,
                'short_name': short_name,
                'long_name': long_name,
                'sample_rate_hz': sample_rate,
            })
        pos += 1

    channels.sort(key=lambda c: c['index'])
    return channels


# ---------------------------------------------------------------------------
# Main processing function
# ---------------------------------------------------------------------------

def parse_xrk(filepath: str) -> dict:
    """Parse a single XRK file and return a result dict."""
    path = Path(filepath)
    with open(path, 'rb') as f:
        data = f.read()

    meta     = parse_metadata(data)
    laps_raw = parse_laps(data)
    laps     = annotate_laps(laps_raw)
    channels = parse_channels(data)

    # Session summary stats
    complete_laps = [l for l in laps if not l.get('partial')]
    best_lap  = min(complete_laps, key=lambda x: x['duration_ms'], default=None)
    avg_ms    = (sum(l['duration_ms'] for l in complete_laps) // len(complete_laps)
                 if complete_laps else 0)
    total_ms  = max((l['end_ms'] for l in laps), default=0)

    result = {
        'file': path.name,
        'filepath': str(path.resolve()),
        'metadata': meta,
        'summary': {
            'total_laps': len(laps),
            'complete_laps': len(complete_laps),
            'best_lap_num': best_lap['lap'] if best_lap else None,
            'best_lap_time': best_lap['time_formatted'] if best_lap else None,
            'best_lap_ms': best_lap['duration_ms'] if best_lap else None,
            'average_lap_time': format_laptime(avg_ms) if avg_ms else None,
            'average_lap_ms': avg_ms,
            'session_duration': format_laptime(total_ms),
            'session_duration_ms': total_ms,
        },
        'laps': laps,
        'channels': channels,
    }
    return result


def print_result(result: dict):
    """Pretty-print a parsed XRK result to stdout."""
    meta = result['metadata']
    summ = result['summary']

    print('=' * 60)
    print(f"FILE    : {result['file']}")
    print(f"DATE    : {meta.get('date', 'N/A')}  {meta.get('time', '')}")
    print(f"TRACK   : {meta.get('track', 'N/A')}")
    if 'driver' in meta:
        print(f"DRIVER  : {meta['driver']}")
    if 'vehicle' in meta:
        print(f"VEHICLE : {meta['vehicle']}")
    if 'championship' in meta:
        print(f"CHAMP   : {meta['championship']}")
    print(f"SESSION : {meta.get('session_type', 'N/A')}")
    print(f"MODE    : {meta.get('race_mode', 'N/A')}")
    print()
    print(f"LAPS    : {summ['complete_laps']} complete  ({summ['total_laps']} total incl. partial)")
    print(f"BEST    : Lap {summ['best_lap_num']}  {summ['best_lap_time']}")
    print(f"AVERAGE : {summ['average_lap_time']}")
    print(f"DURATION: {summ['session_duration']}")
    print()
    print(f"{'Lap':>4}  {'Time':>10}  {'Gap':>10}  {'Note'}")
    print('-' * 42)
    for lap in result['laps']:
        note = ''
        if lap['lap'] == 1:
            note = 'outlap'
        elif lap.get('partial'):
            note = 'partial'
        elif lap.get('is_best'):
            note = '*** BEST ***'
        gap_str = lap.get('gap_to_best') or '---'
        print(f"{lap['lap']:>4}  {lap['time_formatted']:>10}  {gap_str:>10}  {note}")

    print()
    print(f"CHANNELS ({len(result['channels'])}):")
    for ch in result['channels']:
        hz = ch['sample_rate_hz'] // 1000  # stored as millihertz
        hz_str = f"{hz} Hz" if hz else "event"
        print(f"  [{ch['index']:3d}] {ch['short_name']:<8}  {ch['long_name']:<24}  {hz_str}")
    print('=' * 60)


def save_json(result: dict, output_path: str = None):
    """Save result as JSON alongside the XRK file."""
    if output_path is None:
        output_path = Path(result['filepath']).with_suffix('.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    return str(output_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    if not args:
        # Default: process all XRK files found in the same folder as this script
        script_dir = Path(__file__).parent
        xrk_files = list(script_dir.rglob('*.xrk'))
        if not xrk_files:
            print("Usage: python3 xrk-parser.py <file.xrk> [file2.xrk ...] [folder/]")
            sys.exit(1)
    else:
        xrk_files = []
        for arg in args:
            p = Path(arg)
            if p.is_dir():
                xrk_files.extend(p.rglob('*.xrk'))
            elif p.is_file() and p.suffix.lower() == '.xrk':
                xrk_files.append(p)
            else:
                print(f"Skipping: {arg} (not an .xrk file or directory)")

    if not xrk_files:
        print("No .xrk files found.")
        sys.exit(1)

    all_results = []
    for xrk_path in sorted(xrk_files):
        try:
            result = parse_xrk(str(xrk_path))
            print_result(result)
            json_path = save_json(result)
            print(f"  → JSON saved: {json_path}\n")
            all_results.append(result)
        except Exception as e:
            print(f"ERROR parsing {xrk_path}: {e}")
            import traceback; traceback.print_exc()

    return all_results


if __name__ == '__main__':
    main()
