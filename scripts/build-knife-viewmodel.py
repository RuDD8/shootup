import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE_KNIFE = ROOT / "public/models/bayonet.glb"
BLEND_OUT = ROOT / "assets/models/knife_viewmodel.blend"
GLB_OUT = ROOT / "public/models/knife_viewmodel.glb"

# Clear scene data without factory-resetting Blender, which would disable the
# active MCP add-on when this script is run interactively.
for existing_object in list(bpy.data.objects):
    bpy.data.objects.remove(existing_object, do_unlink=True)
for existing_collection in list(bpy.data.collections):
    bpy.data.collections.remove(existing_collection)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.look = "AgX - Medium High Contrast"

collection = bpy.data.collections.new("FPS_Knife_Viewmodel")
scene.collection.children.link(collection)


def move_to_collection(obj):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def material(name, color, roughness=0.75, metalness=0.02):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*color, 1)
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metalness
    return result


SKIN = material("FPS_Skin", (0.64, 0.36, 0.22), 0.82, 0)
SKIN_LIGHT = material("FPS_Nails", (0.78, 0.52, 0.36), 0.76, 0)
GLOVE = material("FPS_Glove", (0.025, 0.032, 0.043), 0.84, 0.02)
PAD = material("FPS_GlovePad", (0.09, 0.105, 0.125), 0.74, 0.04)
SLEEVE = material("FPS_Sleeve", (0.055, 0.105, 0.18), 0.86, 0.01)
CUFF = material("FPS_Cuff", (0.018, 0.025, 0.035), 0.88, 0.01)


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = location
    obj.empty_display_size = 0.025
    obj.parent = parent
    return obj


def rounded_box(name, location, dimensions, mat, parent, rotation=(0, 0, 0), bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.dimensions = dimensions
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("Rounded edges", "BEVEL")
    modifier.width = min(bevel, min(dimensions) * 0.35)
    modifier.segments = 3
    obj.parent = parent
    return obj


def tapered_limb(name, start, end, radius_start, radius_end, mat, parent):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=12,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=midpoint,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    obj.data.materials.append(mat)
    obj.parent = parent
    bevel = obj.modifiers.new("Soft rim", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 2
    return obj


def finger_segment(name, start, end, width, mat, parent, depth=0.032):
    """Rounded box between two arbitrary 3D points, slightly overlong so
    chained segments overlap at the joints without visible gaps."""
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    bpy.ops.mesh.primitive_cube_add(location=(start_v + end_v) * 0.5)
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.dimensions = (direction.length + width * 0.55, depth, width)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(direction.normalized())
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("Rounded edges", "BEVEL")
    modifier.width = width * 0.42
    modifier.segments = 3
    obj.parent = parent
    return obj


root = empty("FPS_Knife_Root")

# Bring in the authored knife and pose it vertically: blade up, handle in hand.
bpy.ops.import_scene.gltf(filepath=str(SOURCE_KNIFE))
imported = list(bpy.context.selected_objects)
for obj in imported:
    move_to_collection(obj)
# Seat the handle behind the camera-side fingers instead of intersecting them.
knife_pose = empty("Knife_Pose", (0.105, 0.045, 0.035), root)
knife_pose.rotation_euler.x = math.radians(-90)
knife_pose.rotation_euler.z = math.radians(24)
knife_pose.scale = (0.49, 0.49, 0.49)
for obj in imported:
    if obj.parent is None:
        obj.parent = knife_pose

# Right forearm enters from the lower-right and terminates at the WRIST AS
# ROTATED: the hand pivots -60 deg around Z at (0.11, -0.018), which moves the
# glove base to roughly (0.156, 0.008, -0.127). The sleeve and cuff stay
# outside the wrist group, so they must aim at that rotated point or the wrist
# looks dislocated.
tapered_limb(
    "Right_Sleeve",
    (0.38, 0.10, -0.47),
    (0.205, 0.034, -0.205),
    0.087,
    0.064,
    SLEEVE,
    root,
)
tapered_limb(
    "Right_Cuff",
    (0.21, 0.036, -0.21),
    (0.157, 0.012, -0.128),
    0.069,
    0.058,
    CUFF,
    root,
)
rounded_box(
    "Right_Glove_Palm",
    (0.11, 0.035, -0.057),
    (0.115, 0.075, 0.14),
    GLOVE,
    root,
    rotation=(0, math.radians(-4), math.radians(2)),
    bevel=0.022,
)
rounded_box(
    "Right_Palm_Pad",
    (0.11, -0.008, -0.052),
    (0.08, 0.018, 0.092),
    PAD,
    root,
    bevel=0.008,
)
# Strap band across the back of the glove for a bit of visual interest.
rounded_box(
    "Right_Glove_Strap",
    (0.162, 0.035, -0.057),
    (0.018, 0.078, 0.055),
    PAD,
    root,
    rotation=(0, math.radians(-4), math.radians(2)),
    bevel=0.006,
)

# Four skin fingers curl around the camera side of the handle: each finger has
# a proximal segment leaving the palm and a bent distal segment that hooks back
# inward around the grip. Lengths and widths vary per finger (index to pinky)
# so the fist reads as a hand instead of four identical sausages.
FINGER_SPECS = [
    # (z level, tip x, proximal width, distal width)
    (-0.018, 0.058, 0.025, 0.023),
    (-0.050, 0.050, 0.025, 0.023),
    (-0.082, 0.052, 0.024, 0.022),
    (-0.114, 0.062, 0.021, 0.019),
]
for index, (z, tip_x, width_a, width_b) in enumerate(FINGER_SPECS):
    # The knuckle bends near the palm; the distal segment then runs LEFT
    # across the grip so the fingertips point away from the camera, never
    # hooking back toward the player.
    base = (0.158, 0.008, z - 0.004)
    knuckle = (0.122, -0.024, z - 0.002)
    tip = (tip_x, -0.028, z)
    finger_segment(
        f"Right_Finger_{index + 1}_A",
        base,
        knuckle,
        width_a,
        SKIN,
        root,
        depth=width_a + 0.008,
    )
    finger_segment(
        f"Right_Finger_{index + 1}_B",
        knuckle,
        tip,
        width_b,
        SKIN,
        root,
        depth=width_b + 0.008,
    )
    rounded_box(
        f"Right_Nail_{index + 1}",
        (tip_x - 0.003, -0.028, z),
        (0.006, 0.016, 0.011),
        SKIN_LIGHT,
        root,
        bevel=0.002,
    )

# Thumb wraps diagonally up across the front of the grip toward the guard,
# locking over the fingers the way a vertical fist grip actually closes.
finger_segment(
    "Right_Thumb_A",
    (0.150, 0.002, -0.055),
    (0.100, -0.042, -0.028),
    0.030,
    SKIN,
    root,
    depth=0.036,
)
finger_segment(
    "Right_Thumb_B",
    (0.100, -0.042, -0.028),
    (0.064, -0.024, 0.006),
    0.027,
    SKIN,
    root,
    depth=0.032,
)

# Left forearm and relaxed hand, matching the classic knife-ready silhouette.
tapered_limb(
    "Left_Sleeve",
    (-0.41, 0.12, -0.45),
    (-0.205, 0.045, -0.16),
    0.09,
    0.065,
    SLEEVE,
    root,
)
tapered_limb(
    "Left_Cuff",
    (-0.215, 0.046, -0.17),
    (-0.153, 0.02, -0.085),
    0.069,
    0.058,
    CUFF,
    root,
)
# Raised fist flipping the bird at the enemy: back of the hand and the nail
# face away from the camera (+y), so the player sees the palm side while the
# opponent gets the full gesture.
rounded_box(
    "Left_Glove_Palm",
    (-0.125, 0.018, -0.055),
    (0.12, 0.075, 0.095),
    GLOVE,
    root,
    rotation=(0, math.radians(-8), math.radians(-3)),
    bevel=0.022,
)
rounded_box(
    "Left_Palm_Pad",
    (-0.12, -0.02, -0.06),
    (0.085, 0.016, 0.065),
    PAD,
    root,
    bevel=0.008,
)

# Curled index / ring / little fingers on the camera side; the middle slot
# stays open because that finger is extended.
for name, x in (("Left_Finger_1", -0.166), ("Left_Finger_3", -0.106), ("Left_Finger_4", -0.078)):
    rounded_box(
        name,
        (x, -0.028, -0.052),
        (0.026, 0.03, 0.048),
        SKIN,
        root,
        bevel=0.008,
    )

# Extended middle finger rising from the fist, tilted slightly toward the
# enemy. The nail sits on the far (+y) side so opponents see it head-on.
finger_segment(
    "Left_Finger_2_A",
    (-0.136, -0.012, -0.02),
    (-0.134, -0.006, 0.045),
    0.024,
    SKIN,
    root,
    depth=0.03,
)
finger_segment(
    "Left_Finger_2_B",
    (-0.134, -0.006, 0.045),
    (-0.132, 0.004, 0.098),
    0.022,
    SKIN,
    root,
    depth=0.028,
)
rounded_box(
    "Left_Nail_2",
    (-0.132, 0.012, 0.09),
    (0.016, 0.005, 0.013),
    SKIN_LIGHT,
    root,
    bevel=0.002,
)

# Thumb locked across the curled fingers.
finger_segment(
    "Left_Thumb_A",
    (-0.068, -0.035, -0.085),
    (-0.15, -0.045, -0.095),
    0.028,
    SKIN,
    root,
    depth=0.034,
)

# Raise the gesture hand so it reads clearly beside the knife.
left_pose = empty("Left_Ready_Pose", (-0.235, 0.01, 0.05), root)
for obj in list(collection.objects):
    if obj.name.startswith("Left_") and obj is not left_pose:
        obj.parent = left_pose

# The attack animation drives this hierarchy without disturbing the off-hand.
right_pose = empty("Right_Hold_Pose", (0, 0, 0), root)
for obj in list(collection.objects):
    if obj.name.startswith("Right_") and obj is not right_pose:
        obj.parent = right_pose
knife_pose.parent = right_pose

# Rotate only the wrist/hand away from the camera. The forearm and knife retain
# their authored pose while the fingers wrap left around the grip.
right_wrist = empty("Right_Wrist_Pose", (0.11, -0.018, -0.057), right_pose)
bpy.context.view_layer.update()
hand_prefixes = (
    "Right_Glove",
    "Right_Palm",
    "Right_Finger",
    "Right_Nail",
    "Right_Thumb",
)
for obj in list(collection.objects):
    if obj.name.startswith(hand_prefixes):
        world_transform = obj.matrix_world.copy()
        obj.parent = right_wrist
        obj.matrix_world = world_transform
right_wrist.rotation_euler.z = math.radians(-60)

# A named pivot lets Three.js swing the complete authored viewmodel.
root["asset_type"] = "first_person_knife"
root["reference_pose"] = "classic_counter_strike"

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
bpy.ops.object.select_all(action="DESELECT")
for obj in collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(
    filepath=str(GLB_OUT),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
)

print(f"Saved {BLEND_OUT}")
print(f"Exported {GLB_OUT}")
