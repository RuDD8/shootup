import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
BLEND_OUT = ROOT / "assets/models/water_bottle.blend"
GLB_OUT = ROOT / "public/models/water_bottle.glb"


# Keep the active MCP add-on enabled by clearing scene data manually.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for existing_collection in list(bpy.data.collections):
    bpy.data.collections.remove(existing_collection)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = (0.018, 0.024, 0.032)

collection = bpy.data.collections.new("Water_Bottle")
scene.collection.children.link(collection)


def move_to_collection(obj):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def material(name, color, roughness=0.85, metalness=0.0, alpha=1.0, emission=None):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*color, alpha)
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metalness
    if alpha < 1.0:
        shader.inputs["Alpha"].default_value = alpha
        if hasattr(result, "blend_method"):
            result.blend_method = "BLEND"
        if hasattr(result, "surface_render_method"):
            result.surface_render_method = "BLENDED"
        result.use_backface_culling = True
    if emission:
        emission_input = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        if emission_input:
            emission_input.default_value = (*emission, 1)
        strength = shader.inputs.get("Emission Strength")
        if strength:
            strength.default_value = 1.5
    return result


PLASTIC = material("Bottle_Plastic", (0.62, 0.82, 0.94), 0.08, alpha=0.32)
WATER = material("Bottle_Water", (0.12, 0.45, 0.78), 0.05, alpha=0.8)
CAP = material("Bottle_Cap", (0.12, 0.32, 0.62), 0.4)
LABEL = material("Bottle_Label", (0.94, 0.97, 0.99), 0.55)
INK = material("Label_Ink", (0.08, 0.3, 0.62), 0.5)


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    obj.empty_display_size = 0.025
    return obj


def cylinder(name, location, radius, depth, mat, parent, vertices=24, bevel=0.002):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def cone(name, location, radius1, radius2, depth, mat, parent, vertices=24):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def torus(name, location, major_radius, minor_radius, mat, parent):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=24,
        minor_segments=8,
        location=location,
    )
    obj = move_to_collection(bpy.context.object)
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


root = empty("Bottle_Root")
root["asset_type"] = "prop"
root["weapon_id"] = "pee"

# Clear plastic body with the water level visible inside (about two thirds
# full, so there is something left to drink).
cylinder("Bottle_Body", (0, 0, 0.09), 0.042, 0.16, PLASTIC, root)
cylinder("Bottle_Water_Fill", (0, 0, 0.062), 0.037, 0.10, WATER, root, bevel=0)

# Grip ribs pressed into the plastic.
torus("Body_Rib_Low", (0, 0, 0.045), 0.0425, 0.0032, PLASTIC, root)
torus("Body_Rib_High", (0, 0, 0.135), 0.0425, 0.0032, PLASTIC, root)

# Shoulder tapering into the neck, then the screw cap.
cone("Bottle_Shoulder", (0, 0, 0.1875), 0.042, 0.016, 0.035, PLASTIC, root)
cylinder("Bottle_Neck", (0, 0, 0.212), 0.016, 0.016, PLASTIC, root, bevel=0)
cylinder("Bottle_Cap", (0, 0, 0.231), 0.019, 0.024, CAP, root)
torus("Cap_Rib", (0, 0, 0.226), 0.0192, 0.0022, CAP, root)

# Wrap-around label with the word WATER stamped on the front (-Y).
cylinder("Bottle_Label", (0, 0, 0.088), 0.0435, 0.05, LABEL, root, bevel=0)

text_curve = bpy.data.curves.new("Label_Text", type="FONT")
text_curve.body = "WATER"
text_curve.size = 0.02
text_curve.extrude = 0.0018
text_curve.align_x = "CENTER"
text_curve.align_y = "CENTER"
text_obj = bpy.data.objects.new("Label_Word", text_curve)
collection.objects.link(text_obj)
text_obj.rotation_euler = (math.pi / 2, 0, 0)
bpy.context.view_layer.objects.active = text_obj
text_obj.select_set(True)
bpy.ops.object.convert(target="MESH")
text_obj = bpy.context.object
text_obj.data.materials.append(INK)
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
text_obj.location = (0, -0.0445, 0.088)
text_obj.parent = root

# Socket used to align the bottle with the drinking hand.
empty("Hold_Socket", (0, 0, 0.08), root)

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
