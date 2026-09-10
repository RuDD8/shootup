import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
BLEND_OUT = ROOT / "assets/models/fahh_text.blend"
GLB_OUT = ROOT / "public/models/fahh_text.glb"


# Keep the active MCP add-on enabled by clearing scene data manually.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for existing_collection in list(bpy.data.collections):
    bpy.data.collections.remove(existing_collection)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = (0.018, 0.024, 0.032)

collection = bpy.data.collections.new("FAHH_Text")
scene.collection.children.link(collection)


def move_to_collection(obj):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def material(name, color, roughness=0.85, metalness=0.0, emission=None, strength=1.6):
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
        strength_input = shader.inputs.get("Emission Strength")
        if strength_input:
            strength_input.default_value = strength
    return result


# Loud meme-yellow letters that read from any distance; the emission keeps the
# word legible while it screams across the arena.
LETTERS = material(
    "Fahh_Letters", (1.0, 0.68, 0.04), 0.42, 0.05,
    emission=(0.85, 0.42, 0.02), strength=2.2,
)


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    obj.empty_display_size = 0.05
    return obj


root = empty("Fahh_Text_Root")
root["asset_type"] = "projectile"
root["weapon_id"] = "fahgun"

# Upright extruded lettering: width along X, glyph height along Z, front face
# toward -Y (which the glTF conversion turns into three.js +Z, facing camera).
bpy.ops.object.text_add(location=(0, 0, 0))
text_obj = move_to_collection(bpy.context.object)
text_obj.name = "Fahh_Word"
text_obj.data.body = "FAHH"
text_obj.data.size = 0.5
text_obj.data.extrude = 0.05
text_obj.data.bevel_depth = 0.012
text_obj.data.bevel_resolution = 2
text_obj.data.align_x = "CENTER"
text_obj.data.align_y = "CENTER"
text_obj.data.shear = 0.12  # slight italic so it looks like it is moving fast
text_obj.rotation_euler = (math.pi / 2, 0, 0)
bpy.context.view_layer.objects.active = text_obj
bpy.ops.object.convert(target="MESH")
text_obj = bpy.context.object
text_obj.data.materials.append(LETTERS)
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
text_obj.location = (0, 0, 0)
text_obj.parent = root

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
