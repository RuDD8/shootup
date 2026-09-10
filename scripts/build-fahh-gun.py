import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
BLEND_OUT = ROOT / "assets/models/fahh_gun.blend"
GLB_OUT = ROOT / "public/models/fahh_gun.glb"


# Keep the active MCP add-on enabled by clearing scene data manually.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for existing_collection in list(bpy.data.collections):
    bpy.data.collections.remove(existing_collection)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = (0.018, 0.024, 0.032)

collection = bpy.data.collections.new("FAHH_Gun")
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
            strength.default_value = 1.6
    return result


OLIVE = material("Fahh_Olive", (0.16, 0.20, 0.10), 0.68, 0.12)
DARK = material("Fahh_Dark_Metal", (0.055, 0.065, 0.075), 0.5, 0.35)
RED = material("Fahh_Warning_Red", (0.62, 0.06, 0.045), 0.5, 0.1)
STEEL = material("Fahh_Steel", (0.42, 0.46, 0.52), 0.35, 0.6)
YELLOW = material("Fahh_Text_Yellow", (0.95, 0.62, 0.05), 0.45, 0.05, emission=(0.55, 0.28, 0.01))
SIGHT = material("Fahh_Sight_Glow", (0.03, 0.05, 0.08), 0.4, 0.1, emission=(1.0, 0.35, 0.05))


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    obj.empty_display_size = 0.05
    return obj


def cylinder(name, location, radius, depth, mat, parent, rotation=(math.pi / 2, 0, 0), vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    bevel = obj.modifiers.new("Edge softening", "BEVEL")
    bevel.width = 0.006
    bevel.segments = 2
    return obj


def cone(name, location, radius1, radius2, depth, mat, parent, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=24, radius1=radius1, radius2=radius2, depth=depth,
        location=location, rotation=rotation,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    bevel = obj.modifiers.new("Edge softening", "BEVEL")
    bevel.width = 0.005
    bevel.segments = 2
    return obj


def box(name, location, dimensions, mat, parent, rotation=(0, 0, 0), bevel=0.008):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = move_to_collection(bpy.context.object)
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


def torus(name, location, major_radius, minor_radius, mat, parent, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius, minor_radius=minor_radius,
        major_segments=24, minor_segments=8,
        location=location, rotation=rotation,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def side_text(name, x, parent):
    """Extruded FAHH lettering on the tube flank, reading muzzle-forward."""
    bpy.ops.object.text_add(location=(x, 0.04, 0.015))
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.data.body = "FAHH"
    obj.data.size = 0.11
    obj.data.extrude = 0.014
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.rotation_euler = (math.pi / 2, 0, math.pi / 2 if x > 0 else -math.pi / 2)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.data.materials.append(YELLOW)
    obj.parent = parent
    return obj


root = empty("Fahh_Gun_Root")
root["asset_type"] = "weapon"
root["weapon_id"] = "fahgun"

# Muzzle points down -Y (mountWeaponModel yaws 180 degrees for -Z forward).
# Main launch tube.
cylinder("Main_Tube", (0, 0.05, 0), 0.085, 1.05, OLIVE, root)
cylinder("Tube_Collar_Front", (0, -0.42, 0), 0.092, 0.07, DARK, root)
cylinder("Tube_Collar_Rear", (0, 0.5, 0), 0.092, 0.07, DARK, root)

# Bell muzzle with a red rim and a dark throat.
cone("Muzzle_Bell", (0, -0.60, 0), 0.135, 0.088, 0.24, DARK, root)
torus("Muzzle_Rim", (0, -0.715, 0), 0.126, 0.012, RED, root)
cylinder("Muzzle_Throat", (0, -0.70, 0), 0.105, 0.03, DARK, root)

# Rear exhaust flare.
cone("Exhaust_Flare", (0, 0.63, 0), 0.082, 0.115, 0.18, DARK, root)
cylinder("Exhaust_Lip", (0, 0.72, 0), 0.118, 0.025, STEEL, root)

# Warning stripes near the muzzle.
torus("Warning_Stripe_A", (0, -0.30, 0), 0.088, 0.008, RED, root)
torus("Warning_Stripe_B", (0, -0.25, 0), 0.088, 0.008, RED, root)

# Top carry handle and forward sight.
box("Handle_Post_Front", (0, -0.08, 0.115), (0.03, 0.035, 0.07), DARK, root)
box("Handle_Post_Rear", (0, 0.18, 0.115), (0.03, 0.035, 0.07), DARK, root)
box("Handle_Bar", (0, 0.05, 0.155), (0.032, 0.32, 0.028), DARK, root)
box("Sight_Blade", (0, -0.34, 0.115), (0.022, 0.03, 0.06), DARK, root)
box("Sight_Dot", (0, -0.34, 0.15), (0.016, 0.016, 0.016), SIGHT, root)

# Pistol grip with trigger guard, plus a forward grip.
box("Pistol_Grip", (0, 0.16, -0.155), (0.045, 0.075, 0.15), OLIVE, root, rotation=(0.28, 0, 0))
box("Trigger_Guard", (0, 0.09, -0.135), (0.03, 0.11, 0.014), DARK, root)
box("Trigger", (0, 0.115, -0.115), (0.016, 0.014, 0.045), STEEL, root, rotation=(0.2, 0, 0))
cylinder("Front_Grip", (0, -0.16, -0.15), 0.028, 0.13, DARK, root, rotation=(0, 0, 0))

# Shoulder rest under the rear of the tube.
box("Shoulder_Rest", (0, 0.42, -0.115), (0.05, 0.2, 0.045), OLIVE, root)

# FAHH lettering on both flanks.
side_text("Side_Text_Right", 0.082, root)
side_text("Side_Text_Left", -0.082, root)

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
