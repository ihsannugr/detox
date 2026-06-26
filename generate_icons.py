import os
import zlib
import struct

def write_png(buf, width, height):
    # buf is bytes of length width * height * 4
    png = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
        
    png += chunk(b'IHDR', ihdr)
    
    raw = b''
    for y in range(height):
        raw += b'\x00' # Filter type 0 (None)
        offset = y * width * 4
        raw += buf[offset : offset + width * 4]
        
    png += chunk(b'IDAT', zlib.compress(raw))
    png += chunk(b'IEND', b'')
    return png

def make_icon(size):
    buf = bytearray(size * size * 4)
    cx, cy = size / 2.0, size / 2.0
    
    # Outer radius for rounded corner box
    r_corner = size * 0.4
    padding = size * 0.1
    border_w = max(1, size // 12)
    
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            
            # Distance from center
            dx = x - cx + 0.5
            dy = y - cy + 0.5
            dist_to_center = (dx*dx + dy*dy)**0.5
            
            # Check if inside rounded box
            # Simple approximation of rounded rect:
            # Check if within bounding box with padding
            in_box = (padding <= x < size - padding) and (padding <= y < size - padding)
            
            # Calculate distance to nearest corner to round it
            corner_x = size - padding - r_corner
            corner_y = size - padding - r_corner
            
            is_corner = False
            corner_dist = 0
            if x < padding + r_corner:
                target_x = padding + r_corner
                if y < padding + r_corner:
                    target_y = padding + r_corner
                    is_corner = True
                elif y >= size - padding - r_corner:
                    target_y = size - padding - r_corner
                    is_corner = True
            elif x >= size - padding - r_corner:
                target_x = size - padding - r_corner
                if y < padding + r_corner:
                    target_y = padding + r_corner
                    is_corner = True
                elif y >= size - padding - r_corner:
                    target_y = size - padding - r_corner
                    is_corner = True
            
            if is_corner:
                cdx = x - target_x
                cdy = y - target_y
                corner_dist = (cdx*cdx + cdy*cdy)**0.5
                in_box = corner_dist <= r_corner
                is_border = abs(corner_dist - r_corner) < border_w
            else:
                # Border check on flat sides
                is_border = (
                    (abs(x - padding) < border_w or abs(x - (size - padding - 1)) < border_w) and (padding <= y < size - padding) or
                    (abs(y - padding) < border_w or abs(y - (size - padding - 1)) < border_w) and (padding <= x < size - padding)
                )

            # Draw Logo inside: letter "D" or ring
            # Let's draw a nice neon green ring with a violet slash in the middle (Detox symbol)
            # Outer ring: radius size*0.18 to size*0.28
            r_inner = size * 0.14
            r_outer = size * 0.25
            
            is_ring = r_inner <= dist_to_center <= r_outer
            
            # A slash going from bottom-left to top-right
            is_slash = False
            if abs(dx + dy) < max(1, size // 10) and dist_to_center < r_outer + max(2, size//8):
                is_slash = True
                
            if in_box:
                if is_border:
                    # Emerald Green Border (#10B981)
                    buf[idx] = 16
                    buf[idx+1] = 185
                    buf[idx+2] = 129
                    buf[idx+3] = 255
                elif is_slash:
                    # Violet slash (#8B5CF6)
                    buf[idx] = 139
                    buf[idx+1] = 92
                    buf[idx+2] = 246
                    buf[idx+3] = 255
                elif is_ring:
                    # Emerald Green Ring
                    buf[idx] = 16
                    buf[idx+1] = 185
                    buf[idx+2] = 129
                    buf[idx+3] = 255
                else:
                    # Deep Obsidian Dark (#0F1419)
                    buf[idx] = 15
                    buf[idx+1] = 20
                    buf[idx+2] = 25
                    buf[idx+3] = 255
            else:
                # Transparent outside
                buf[idx] = 0
                buf[idx+1] = 0
                buf[idx+2] = 0
                buf[idx+3] = 0
                
    return write_png(bytes(buf), size, size)

def main():
    os.makedirs("icons", exist_ok=True)
    for size in [16, 48, 128]:
        png_data = make_icon(size)
        with open(f"icons/icon{size}.png", "wb") as f:
            f.write(png_data)
        print(f"Generated icons/icon{size}.png")

if __name__ == "__main__":
    main()
