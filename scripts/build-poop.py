import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
BLEND_OUT = ROOT / "assets/models/poop.blend"
GLB_OUT = ROOT / "public/models/poop.glb"


# Keep the active MCP add-on enabled by clearing scene data manually.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for existing_collection in list(bpy.data.collections):
    bpy.data.collections.remove(existing_collection)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = (0.018, 0.024, 0.032)

collection = bpy.data.collections.new("Throwable_Poop")
scene.collection.children.link(collection)


def move_to_collection(obj):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def material(name, color, roughness=0.85, metalness=0.0, emission=None):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*color, 1)
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metalness
    if emission:
        emission_input = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        if emission_input:
            emission_input.default_value = (*emission, 1)
        strength = shader.inputs.get("Emission Strength")
        if strength:
            strength.default_value = 1.5
    return result


BROWN = material("Poop_Brown", (0.28, 0.105, 0.025), 0.9)
BROWN_LIGHT = material("Poop_Highlight", (0.47, 0.205, 0.055), 0.82)
BROWN_DARK = material("Poop_Crease", (0.105, 0.028, 0.008), 0.94)
WET = material("Poop_Wet", (0.18, 0.05, 0.012), 0.4)
CORN = material("Poop_Corn", (0.95, 0.60, 0.055), 0.78)
GREEN = material("Poop_Stink", (0.29, 0.55, 0.06), 0.62, emission=(0.18, 0.45, 0.035))


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    obj.empty_display_size = 0.025
    return obj


def sphere(name, location, scale, mat, parent, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = parent
    bevel = obj.modifiers.new("Soft facets", "BEVEL")
    bevel.width = 0.004
    bevel.segments = 2
    return obj


def torus(name, location, major_radius, minor_radius, mat, parent, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=20,
        minor_segments=8,
        location=location,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def rounded_box(name, location, dimensions, mat, parent, rotation=(0, 0, 0), bevel=0.01):
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


def tapered_tip(name, start, end, radius_start, radius_end, mat, parent):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    bpy.ops.mesh.primitive_cone_add(
        vertices=16,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=(start_v + end_v) * 0.5,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    obj.data.materials.append(mat)
    obj.parent = parent
    bevel = obj.modifiers.new("Rounded tip", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 3
    return obj


root = empty("Poop_Root")
root["asset_type"] = "throwable"
root["weapon_id"] = "poopgun"

# A readable low-poly swirl silhouette: broad base, offset coils, curled point.
sphere("Poop_Base", (0, 0, 0.055), (0.18, 0.15, 0.07), BROWN, root)
sphere("Poop_Lower_Coil", (0.018, -0.004, 0.125), (0.15, 0.125, 0.075), BROWN_LIGHT, root)
sphere("Poop_Middle_Coil", (-0.025, 0.003, 0.195), (0.115, 0.10, 0.068), BROWN, root)
sphere("Poop_Upper_Coil", (0.018, -0.002, 0.255), (0.078, 0.070, 0.052), BROWN_LIGHT, root, 16, 10)
tapered_tip("Poop_Curl", (0.02, 0, 0.27), (0.075, 0.004, 0.345), 0.052, 0.006, BROWN, root)

# Dark grooves separate the coils and stop the form reading as stacked rocks.
torus("Crease_Base", (0.01, 0, 0.09), 0.135, 0.011, BROWN_DARK, root, scale=(1.0, 0.82, 0.5))
torus("Crease_Middle", (-0.008, 0, 0.165), 0.098, 0.009, BROWN_DARK, root, scale=(1.0, 0.84, 0.5))
torus("Crease_Upper", (0.012, 0, 0.226), 0.065, 0.007, BROWN_DARK, root, scale=(1.0, 0.86, 0.5))

# Glossy underside and small green residue make it feel throwable and messy.
sphere("Wet_Underside", (0, 0, 0.012), (0.135, 0.105, 0.018), WET, root, 16, 8)
for index, (x, y) in enumerate(((-0.11, 0.045), (0.095, 0.055), (0.04, -0.09))):
    sphere(f"Green_Smear_{index}", (x, y, 0.035), (0.026, 0.02, 0.012), GREEN, root, 12, 7)

# A few corn kernels add color and sell the joke at viewmodel distance.
for index, (location, rotation) in enumerate(
    (
        ((-0.115, -0.072, 0.105), (0.4, 0.2, -0.3)),
        ((0.12, -0.055, 0.145), (-0.2, 0.35, 0.2)),
        ((-0.075, -0.075, 0.215), (0.15, -0.25, 0.5)),
        ((0.047, -0.065, 0.275), (-0.25, 0.2, -0.35)),
    )
):
    rounded_box(
        f"Corn_Kernel_{index}",
        location,
        (0.026, 0.014, 0.038),
        CORN,
        root,
        rotation=rotation,
        bevel=0.006,
    )

# Socket used to align the object with hands later.
empty("Hold_Socket", (0, 0.10, 0.12), root)

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
