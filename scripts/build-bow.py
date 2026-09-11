import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
BLEND_OUT = ROOT / "assets/models/bow.blend"
BOW_GLB = ROOT / "public/models/bow.glb"
ARROW_GLB = ROOT / "public/models/arrow.glb"


# Keep the active MCP add-on enabled by clearing scene data manually.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for existing_collection in list(bpy.data.collections):
    bpy.data.collections.remove(existing_collection)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = (0.018, 0.024, 0.032)

bow_col = bpy.data.collections.new("Bow")
arrow_col = bpy.data.collections.new("Arrow")
scene.collection.children.link(bow_col)
scene.collection.children.link(arrow_col)


def move_to_collection(obj, col):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def material(name, color, roughness=0.85, metalness=0.0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*color, 1)
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metalness
    return result


WOOD = material("Bow_Wood", (0.30, 0.16, 0.055), 0.7)
WOOD_LIGHT = material("Bow_Wood_Light", (0.52, 0.33, 0.14), 0.65)
LEATHER = material("Bow_Leather", (0.16, 0.085, 0.045), 0.88)
STEEL = material("Bow_Steel", (0.42, 0.45, 0.5), 0.3, 0.7)
SHAFT = material("Arrow_Shaft", (0.55, 0.42, 0.22), 0.6)
HEAD = material("Arrow_Head", (0.5, 0.53, 0.58), 0.25, 0.8)
FLETCH_RED = material("Arrow_Fletch_Red", (0.65, 0.1, 0.08), 0.75)
FLETCH_WHITE = material("Arrow_Fletch_White", (0.85, 0.83, 0.78), 0.75)
NOCK = material("Arrow_Nock", (0.08, 0.09, 0.1), 0.6)


def empty(name, col, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    col.objects.link(obj)
    obj.location = location
    obj.parent = parent
    obj.empty_display_size = 0.025
    return obj


def rounded_box(name, col, location, dimensions, mat, parent, rotation=(0, 0, 0), bevel=0.004):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = move_to_collection(bpy.context.object, col)
    obj.name = name
    obj.dimensions = dimensions
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("Rounded edges", "BEVEL")
    modifier.width = min(bevel, min(dimensions) * 0.3)
    modifier.segments = 2
    obj.parent = parent
    return obj


def cylinder(name, col, location, radius, depth, mat, parent, rotation=(0, 0, 0), vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation,
    )
    obj = move_to_collection(bpy.context.object, col)
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def cone(name, col, location, radius, depth, mat, parent, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=12, radius1=radius, radius2=0, depth=depth, location=location, rotation=rotation,
    )
    obj = move_to_collection(bpy.context.object, col)
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


# ── Bow ──────────────────────────────────────────────────────────────────────
# Stands along Z (vertical), archer side +Y, target side -Y. No string: the
# game draws it in three.js so it can animate with the charge.

bow_root = empty("Bow_Root", bow_col)
bow_root["asset_type"] = "weapon"
bow_root["weapon_id"] = "bow"

# Riser: shaped wooden handle with lighter lamination stripe and leather grip.
rounded_box("Riser_Core", bow_col, (0, 0.004, 0), (0.034, 0.055, 0.34), WOOD, bow_root)
rounded_box("Riser_Stripe", bow_col, (0, -0.024, 0), (0.026, 0.012, 0.3), WOOD_LIGHT, bow_root)
rounded_box("Riser_Belly", bow_col, (0, 0.028, 0.02), (0.028, 0.02, 0.22), WOOD, bow_root)
rounded_box("Grip_Wrap", bow_col, (0, 0.006, -0.075), (0.04, 0.06, 0.11), LEATHER, bow_root)
rounded_box("Grip_Ridge_Top", bow_col, (0, 0.006, -0.018), (0.042, 0.062, 0.012), LEATHER, bow_root)
rounded_box("Grip_Ridge_Bot", bow_col, (0, 0.006, -0.132), (0.042, 0.062, 0.012), LEATHER, bow_root)

# Arrow shelf: a small step above the grip with a steel plate.
rounded_box("Arrow_Shelf", bow_col, (0.012, -0.02, 0.045), (0.03, 0.05, 0.014), WOOD, bow_root)
rounded_box("Shelf_Plate", bow_col, (0.012, -0.02, 0.053), (0.026, 0.044, 0.004), STEEL, bow_root)

# Limbs: strung-bow profile. The mid-limb bulges toward the target (-Y), the
# outer limb bends back toward the archer so the string line sits behind the
# riser, and the very tip flares forward again (the recurve).
LIMB_SEGMENTS = [
    # (z_offset, y_offset, tilt_x, width, length)
    (0.2325, -0.0065, 0.17, 0.030, 0.15),
    (0.3650, -0.0190, 0.02, 0.026, 0.14),
    (0.4875, 0.0000, -0.34, 0.022, 0.13),
    (0.5800, 0.0375, -0.46, 0.018, 0.095),
]
for sign, label in ((1, "Upper"), (-1, "Lower")):
    for i, (dz, dy, tilt, width, length) in enumerate(LIMB_SEGMENTS):
        mat = WOOD if i % 2 == 0 else WOOD_LIGHT
        rounded_box(
            f"{label}_Limb_{i}", bow_col,
            (0, dy, sign * dz),
            (width, 0.014, length),
            mat, bow_root,
            rotation=(sign * tilt, 0, 0),
        )
    # Recurve flair with the string nock: the tip kicks toward the target
    # while the string comes off its archer-facing groove.
    rounded_box(
        f"{label}_Tip", bow_col,
        (0, 0.055, sign * 0.638),
        (0.016, 0.02, 0.04),
        STEEL, bow_root,
        rotation=(sign * 0.3, 0, 0),
        bevel=0.003,
    )

# ── Arrow ────────────────────────────────────────────────────────────────────
# Built along Y: steel head at -Y (forward, matching the muzzle convention),
# fletching and nock at +Y.

arrow_root = empty("Arrow_Root", arrow_col)
arrow_root["asset_type"] = "prop"
arrow_root["weapon_id"] = "bow"

cylinder(
    "Arrow_Shaft", arrow_col, (0, -0.02, 0), 0.0055, 0.62, SHAFT, arrow_root,
    rotation=(math.pi / 2, 0, 0),
)
cone(
    "Arrow_Head", arrow_col, (0, -0.355, 0), 0.013, 0.06, HEAD, arrow_root,
    rotation=(math.pi / 2, 0, 0),
)
cylinder(
    "Head_Collar", arrow_col, (0, -0.32, 0), 0.008, 0.02, HEAD, arrow_root,
    rotation=(math.pi / 2, 0, 0),
)
# Three fletching vanes, 120 degrees apart.
for i in range(3):
    ang = i * (2 * math.pi / 3)
    mat = FLETCH_RED if i == 0 else FLETCH_WHITE
    bpy.ops.mesh.primitive_cube_add(location=(0, 0.245, 0))
    vane = move_to_collection(bpy.context.object, arrow_col)
    vane.name = f"Fletch_{i}"
    vane.dimensions = (0.0025, 0.075, 0.030)
    bpy.context.view_layer.objects.active = vane
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    vane.data.materials.append(mat)
    vane.parent = arrow_root
    # Slide the vane outward from the shaft, then spin it around the shaft axis.
    vane.location = (math.sin(ang) * 0.016, 0.245, math.cos(ang) * 0.016)
    vane.rotation_euler = (0, ang, 0)
cylinder(
    "Arrow_Nock", arrow_col, (0, 0.295, 0), 0.007, 0.025, NOCK, arrow_root,
    rotation=(math.pi / 2, 0, 0),
)

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))


def export_collection(col, root, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in col.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )


export_collection(bow_col, bow_root, BOW_GLB)
export_collection(arrow_col, arrow_root, ARROW_GLB)

print(f"Saved {BLEND_OUT}")
print(f"Exported {BOW_GLB}")
print(f"Exported {ARROW_GLB}")
