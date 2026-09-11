"""Draw a board the way this fly can actually see it.

The retina reads three things and nothing else: R1-R6 report linear luminance,
R8y reads the linear green channel and R8p the linear blue channel. A palette
that looks distinct to us can therefore be invisible to the fly, so the colors
below are chosen to spread out in that three-dimensional receptor space rather
than in RGB. PALETTE is ordered so that taking the first N colors keeps them as
far apart as possible; past four colors red and green start to collide, because
a dark red and a mid green differ mostly in a channel the fly does not have.
"""

import numpy as np
from PIL import Image, ImageDraw

from .puzzle import LOCKED

BOARD_WIDTH, BOARD_HEIGHT = 360, 640
RETINA_WIDTH, RETINA_HEIGHT = 90, 160

BACKGROUND = (8, 10, 12)
TUBE_EMPTY = (30, 36, 40)
TUBE_EDGE = (96, 110, 118)
# A locked bottle is drawn as a flat mid-gray slab. It has to be plainly not a
# color, and it has to be the same every time, so that "locked" reads as one
# consistent thing rather than as a color the fly might try to sort.
TUBE_LOCKED = (70, 74, 78)

PALETTE = [
    (250, 205, 20),
    (25, 55, 240),
    (245, 245, 245),
    (15, 150, 30),
    (225, 35, 30),
    (20, 200, 220),
]


def linear(channel):
    """sRGB byte to linear intensity, matching flywirehead.neural.sensory."""
    value = np.asarray(channel, dtype=np.float64) / 255
    return np.where(value <= 0.04045, value / 12.92, ((value + 0.055) / 1.055) ** 2.4)


def receptor_features(rgb):
    """What the fly measures from a color: (luminance, R8y green, R8p blue)."""
    r, g, b = linear(rgb[0]), linear(rgb[1]), linear(rgb[2])
    return np.array([0.2126 * r + 0.7152 * g + 0.0722 * b, g, b])


def palette_separation(colors):
    """Smallest receptor-space distance within a palette slice."""
    features = [receptor_features(c) for c in colors]
    return min(
        float(np.linalg.norm(features[i] - features[j]))
        for i in range(len(features))
        for j in range(i + 1, len(features))
    )


def render_board(board, height, width=BOARD_WIDTH, tall=BOARD_HEIGHT):
    """The board as a portrait image, using large flat blocks.

    Everything is deliberately chunky. The fly only ever receives a 90x160
    downsample, so thin outlines and small gaps average away to nothing.
    """
    image = Image.new("RGB", (width, tall), BACKGROUND)
    draw = ImageDraw.Draw(image)
    count = len(board)
    if count < 1 or height < 1:
        raise ValueError("A board needs at least one tube and a positive height")
    margin = max(8, round(width * 0.04))
    pitch = (width - 2 * margin) / count
    tube_width = pitch * 0.78
    cell = min((tall - 2 * margin) / height, tall * 0.9 / height)
    stack = cell * height
    top = (tall - stack) / 2
    for index, tube in enumerate(board):
        left = margin + pitch * index + (pitch - tube_width) / 2
        right = left + tube_width
        if tube and tube[0] == LOCKED:
            draw.rectangle([left, top, right, top + stack], fill=TUBE_LOCKED)
            draw.rectangle([left, top, right, top + stack], outline=TUBE_EDGE, width=3)
            continue
        draw.rectangle([left, top, right, top + stack], fill=TUBE_EMPTY)
        for slot, color in enumerate(tube):
            # Slot 0 is the bottom of the tube.
            bottom = top + stack - slot * cell
            draw.rectangle(
                [left, bottom - cell, right, bottom], fill=PALETTE[color % len(PALETTE)]
            )
        draw.rectangle([left, top, right, top + stack], outline=TUBE_EDGE, width=3)
    return image


def retina_frame(image):
    """Downsample to the same 90x160 the browser capture delivers."""
    small = image.resize((RETINA_WIDTH, RETINA_HEIGHT), Image.BOX)
    return np.ascontiguousarray(np.asarray(small, dtype=np.uint8))


def board_frame(board, height):
    """Board straight to the uint8 RGB frame the engine consumes."""
    return retina_frame(render_board(board, height))
