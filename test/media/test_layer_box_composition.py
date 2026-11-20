import numpy as np
from moviepy import ColorClip, CompositeVideoClip, ImageClip
from PIL import Image

from app.models.schema import ImageMotion
from app.services.utils.video_effects import OpaqueCompositeVideoClip
from app.services.video import render_image_zoom_video


def test_opaque_composite_matches_moviepy_alpha_blend_and_carries_no_mask():
    base = ColorClip(size=(320, 180), color=(24, 48, 96)).with_duration(1.0)
    rgba = np.zeros((40, 80, 4), dtype=np.uint8)
    rgba[:, :, :3] = (240, 120, 30)
    rgba[:, :, 3] = 160
    badge = ImageClip(rgba).with_duration(1.0).with_position(("center", 120))
    offscreen_crop = ImageClip(rgba).with_duration(1.0).with_position((-20, 10))

    reference = CompositeVideoClip([base, badge, offscreen_crop], size=(320, 180), bg_color=(0, 0, 0))
    optimized = OpaqueCompositeVideoClip([base, badge, offscreen_crop], size=(320, 180), bg_color=(0, 0, 0))
    try:
        assert optimized.mask is None
        np.testing.assert_array_equal(optimized.get_frame(0.5), reference.get_frame(0.5))
    finally:
        reference.close()
        optimized.close()


def test_image_motion_static_vs_smooth_zoom_produces_distinct_valid_outputs(tmp_path):
    image_path = tmp_path / "scene.png"
    grid = np.zeros((120, 120, 3), dtype=np.uint8)
    grid[30:90, 30:90] = (220, 180, 40)
    Image.fromarray(grid).save(image_path)

    static_mp4 = render_image_zoom_video(str(image_path), clip_duration=2, image_motion=ImageMotion.static)
    zoom_mp4 = render_image_zoom_video(str(image_path), clip_duration=2, image_motion=ImageMotion.zoom)
    assert static_mp4 != zoom_mp4
    assert ".static-" in static_mp4
    assert ".zoom-smooth-" in zoom_mp4
    assert len(__import__("os").path.basename(zoom_mp4)) <= 60
