"""Build Blender models for pistol, shotgun, sniper, revolver, machinepistol, deagle.

Convention: muzzle faces Blender -Y. glTF maps to Three.js +Z; mountWeaponModel
applies yaw=π so the game aims along -Z.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets/models"
PUBLIC = ROOT / "public/models"


# ── scene reset (keep MCP addon) ─────────────────────────────────────────────
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
for mat in list(bpy.data.materials):
    bpy.data.materials.remove(mat)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = (0.018, 0.024, 0.032)


def material(name, color, roughness=0.55, metalness=0.35):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*color, 1)
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metalness
    return result


def move_to(obj, col):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def empty(name, col, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    col.objects.link(obj)
    obj.location = location
    obj.parent = parent
    obj.empty_display_size = 0.03
    return obj


def box(name, col, loc, dims, mat, parent, rot=(0, 0, 0), bevel=0.003):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = move_to(bpy.context.object, col)
    obj.name = name
    obj.dimensions = dims
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = min(bevel, min(dims) * 0.28)
    mod.segments = 2
    obj.parent = parent
    return obj


def cyl(name, col, loc, radius, depth, mat, parent, rot=(0, 0, 0), verts=12, bevel=0.0015):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = move_to(bpy.context.object, col)
    obj.name = name
    obj.data.materials.append(mat)
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = bevel
    mod.segments = 1
    obj.parent = parent
    return obj


def export_collection(col, root, path: Path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in col.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )


# Materials
STEEL = material("Gun_Steel", (0.42, 0.45, 0.5), 0.28, 0.75)
DARK = material("Gun_Dark", (0.08, 0.09, 0.1), 0.55, 0.4)
SLIDE = material("Gun_Slide", (0.18, 0.2, 0.22), 0.35, 0.55)
POLYMER = material("Gun_Polymer", (0.12, 0.13, 0.14), 0.75, 0.05)
GRIP = material("Gun_Grip", (0.14, 0.12, 0.1), 0.85, 0.02)
WOOD = material("Gun_Wood", (0.38, 0.22, 0.1), 0.7, 0.05)
WOOD_DARK = material("Gun_WoodDark", (0.22, 0.12, 0.05), 0.75, 0.04)
BLUE = material("Gun_Blued", (0.12, 0.16, 0.22), 0.4, 0.55)
BRASS = material("Gun_Brass", (0.72, 0.55, 0.22), 0.35, 0.7)
GOLD = material("Gun_Gold", (0.78, 0.62, 0.2), 0.3, 0.85)
OLIVE = material("Gun_Olive", (0.28, 0.32, 0.18), 0.7, 0.08)
TAN = material("Gun_Tan", (0.55, 0.45, 0.28), 0.65, 0.05)
BLACK = material("Gun_Black", (0.04, 0.04, 0.045), 0.5, 0.3)
GLOW = material("Gun_Glow", (0.85, 0.15, 0.1), 0.4, 0.2)


def build_pistol():
    col = bpy.data.collections.new("Pistol")
    scene.collection.children.link(col)
    root = empty("Pistol_Root", col)
    root["weapon_id"] = "pistol"

    # Slide
    box("Slide", col, (0, -0.02, 0.055), (0.078, 0.22, 0.048), SLIDE, root)
    box("Serrations", col, (0, 0.05, 0.055), (0.082, 0.05, 0.02), DARK, root)
    # Frame
    box("Frame", col, (0, -0.01, 0.01), (0.072, 0.2, 0.05), POLYMER, root)
    box("Dust_Cover", col, (0, -0.18, 0.02), (0.05, 0.1, 0.035), STEEL, root)
    cyl("Barrel", col, (0, -0.255, 0.02), 0.012, 0.07, STEEL, root, rot=(math.pi / 2, 0, 0))
    # Grip
    box("Grip", col, (0, 0.05, -0.08), (0.055, 0.07, 0.14), GRIP, root, rot=(0.35, 0, 0))
    box("Mag_Floor", col, (0, 0.07, -0.16), (0.05, 0.065, 0.02), DARK, root)
    # Trigger guard
    box("Guard_Bot", col, (0, 0.0, -0.035), (0.045, 0.06, 0.012), POLYMER, root)
    box("Guard_L", col, (-0.016, 0.0, -0.055), (0.012, 0.012, 0.05), POLYMER, root)
    box("Guard_R", col, (0.016, 0.0, -0.055), (0.012, 0.012, 0.05), POLYMER, root)
    # Irons
    box("Rear_Sight_L", col, (-0.014, 0.06, 0.085), (0.012, 0.014, 0.018), SLIDE, root)
    box("Rear_Sight_R", col, (0.014, 0.06, 0.085), (0.012, 0.014, 0.018), SLIDE, root)
    box("Front_Sight", col, (0, -0.11, 0.085), (0.01, 0.012, 0.02), GLOW, root)

    export_collection(col, root, PUBLIC / "pistol.glb")
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "pistol.blend"))
    print("Exported pistol.glb")
    return root


def build_deagle():
    col = bpy.data.collections.new("Deagle")
    scene.collection.children.link(col)
    root = empty("Deagle_Root", col)
    root["weapon_id"] = "deagle"

    box("Slide", col, (0, -0.04, 0.06), (0.09, 0.28, 0.058), SLIDE, root)
    box("Frame", col, (0, -0.02, 0.01), (0.082, 0.24, 0.055), DARK, root)
    box("Barrel_Housing", col, (0, -0.22, 0.025), (0.065, 0.12, 0.04), STEEL, root)
    cyl("Barrel", col, (0, -0.32, 0.025), 0.016, 0.08, STEEL, root, rot=(math.pi / 2, 0, 0))
    # Comp slots
    box("Comp_1", col, (0, -0.18, 0.07), (0.092, 0.04, 0.015), GOLD, root)
    box("Comp_2", col, (0, -0.14, 0.07), (0.092, 0.04, 0.015), GOLD, root)
    box("Gold_Rear", col, (0, 0.05, 0.06), (0.084, 0.06, 0.02), GOLD, root)
    box("Grip", col, (0, 0.05, -0.09), (0.062, 0.075, 0.15), GRIP, root, rot=(0.32, 0, 0))
    box("Gold_Floor", col, (0, 0.07, -0.17), (0.055, 0.07, 0.02), GOLD, root)
    box("Guard_Bot", col, (0, 0.0, -0.035), (0.05, 0.065, 0.012), DARK, root)
    box("Guard_L", col, (-0.018, 0.0, -0.055), (0.014, 0.012, 0.05), DARK, root)
    box("Guard_R", col, (0.018, 0.0, -0.055), (0.014, 0.012, 0.05), DARK, root)
    box("Rear_Sight_L", col, (-0.016, 0.06, 0.095), (0.014, 0.016, 0.02), SLIDE, root)
    box("Rear_Sight_R", col, (0.016, 0.06, 0.095), (0.014, 0.016, 0.02), SLIDE, root)
    box("Front_Sight", col, (0, -0.14, 0.095), (0.012, 0.014, 0.022), GLOW, root)

    export_collection(col, root, PUBLIC / "deagle.glb")
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "deagle.blend"))
    print("Exported deagle.glb")
    return root


def build_revolver():
    col = bpy.data.collections.new("Revolver")
    scene.collection.children.link(col)
    root = empty("Revolver_Root", col)
    root["weapon_id"] = "revolver"

    box("Frame_Top", col, (0, -0.02, 0.04), (0.07, 0.16, 0.055), STEEL, root)
    box("Frame_Bot", col, (0, 0.01, -0.01), (0.06, 0.12, 0.04), STEEL, root)
    # Cylinder along X
    cyl("Cylinder", col, (0, -0.06, 0.03), 0.04, 0.065, DARK, root, rot=(0, math.pi / 2, 0), verts=16)
    for i in range(6):
        a = i * (math.pi * 2 / 6)
        cyl(
            f"Chamber_{i}", col,
            (0, -0.06 + math.cos(a) * 0.025, 0.03 + math.sin(a) * 0.025),
            0.008, 0.068, BRASS, root, rot=(0, math.pi / 2, 0), verts=8,
        )
    box("Barrel_Shroud", col, (0, -0.2, 0.055), (0.042, 0.18, 0.038), STEEL, root)
    cyl("Barrel", col, (0, -0.24, 0.04), 0.015, 0.22, BLACK, root, rot=(math.pi / 2, 0, 0))
    box("Front_Sight", col, (0, -0.3, 0.082), (0.012, 0.014, 0.026), BRASS, root)
    box("Hammer", col, (0, 0.05, 0.085), (0.018, 0.025, 0.04), STEEL, root)
    box("Grip", col, (0, 0.055, -0.08), (0.055, 0.07, 0.14), WOOD, root, rot=(0.38, 0, 0))
    box("Grip_Plate", col, (0.028, 0.055, -0.07), (0.004, 0.05, 0.1), WOOD_DARK, root, rot=(0.38, 0, 0))
    box("Guard_Bot", col, (0, 0.0, -0.02), (0.042, 0.055, 0.012), STEEL, root)
    box("Guard_L", col, (-0.014, 0.0, -0.04), (0.012, 0.012, 0.042), STEEL, root)
    box("Guard_R", col, (0.014, 0.0, -0.04), (0.012, 0.012, 0.042), STEEL, root)

    export_collection(col, root, PUBLIC / "revolver.glb")
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "revolver.blend"))
    print("Exported revolver.glb")
    return root


def build_machinepistol():
    col = bpy.data.collections.new("MachinePistol")
    scene.collection.children.link(col)
    root = empty("MachinePistol_Root", col)
    root["weapon_id"] = "machinepistol"

    box("Slide", col, (0, -0.02, 0.055), (0.068, 0.2, 0.045), SLIDE, root)
    box("Frame", col, (0, -0.01, 0.012), (0.065, 0.18, 0.045), POLYMER, root)
    box("Barrel_Housing", col, (0, -0.16, 0.02), (0.045, 0.08, 0.032), STEEL, root)
    cyl("Barrel", col, (0, -0.23, 0.02), 0.011, 0.06, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Ext_Mag", col, (0, -0.02, -0.1), (0.04, 0.065, 0.18), DARK, root)
    box("Mag_Floor", col, (0, -0.02, -0.2), (0.042, 0.067, 0.02), STEEL, root)
    box("Wire_Stock", col, (0.04, 0.06, 0.04), (0.01, 0.22, 0.01), STEEL, root)
    box("Stock_End", col, (0.04, 0.16, 0.01), (0.01, 0.01, 0.06), STEEL, root)
    box("Grip", col, (0, 0.05, -0.07), (0.05, 0.065, 0.12), GRIP, root, rot=(0.35, 0, 0))
    box("Cocking", col, (0, 0.04, 0.06), (0.09, 0.02, 0.016), DARK, root)
    box("Guard_Bot", col, (0, 0.0, -0.03), (0.04, 0.05, 0.01), POLYMER, root)
    box("Rear_Sight_L", col, (-0.012, 0.05, 0.082), (0.01, 0.012, 0.016), SLIDE, root)
    box("Rear_Sight_R", col, (0.012, 0.05, 0.082), (0.01, 0.012, 0.016), SLIDE, root)
    box("Front_Sight", col, (0, -0.1, 0.082), (0.01, 0.012, 0.018), GLOW, root)

    export_collection(col, root, PUBLIC / "machinepistol.glb")
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "machinepistol.blend"))
    print("Exported machinepistol.glb")
    return root


def build_shotgun():
    col = bpy.data.collections.new("Shotgun")
    scene.collection.children.link(col)
    root = empty("Shotgun_Root", col)
    root["weapon_id"] = "shotgun"

    box("Receiver", col, (0, -0.02, 0.025), (0.08, 0.26, 0.09), BLUE, root)
    cyl("Barrel", col, (0, -0.4, 0.035), 0.026, 0.42, STEEL, root, rot=(math.pi / 2, 0, 0), verts=14)
    cyl("Muzzle_Ring", col, (0, -0.62, 0.035), 0.03, 0.04, BRASS, root, rot=(math.pi / 2, 0, 0))
    cyl("Mag_Tube", col, (0, -0.32, -0.01), 0.016, 0.28, BLUE, root, rot=(math.pi / 2, 0, 0))
    box("Pump", col, (0, -0.28, -0.035), (0.085, 0.15, 0.07), WOOD, root)
    box("Pump_Top", col, (0, -0.28, 0.005), (0.09, 0.13, 0.015), WOOD_DARK, root)
    box("Ejection", col, (0.035, -0.06, 0.04), (0.02, 0.08, 0.04), GLOW, root)
    box("Guard_Bot", col, (0, 0.04, -0.03), (0.04, 0.055, 0.01), BLUE, root)
    box("Grip", col, (0, 0.1, -0.06), (0.055, 0.07, 0.12), WOOD, root, rot=(0.4, 0, 0))
    box("Stock", col, (0, 0.26, 0.0), (0.065, 0.22, 0.08), WOOD, root)
    box("Butt", col, (0, 0.38, -0.02), (0.075, 0.04, 0.14), WOOD_DARK, root)
    box("Bead", col, (0, -0.58, 0.07), (0.014, 0.014, 0.018), BRASS, root)

    export_collection(col, root, PUBLIC / "shotgun.glb")
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "shotgun.blend"))
    print("Exported shotgun.glb")
    return root


def build_sniper():
    col = bpy.data.collections.new("Sniper")
    scene.collection.children.link(col)
    root = empty("Sniper_Root", col)
    root["weapon_id"] = "sniper"

    box("Chassis", col, (0, -0.05, 0.015), (0.07, 0.42, 0.07), OLIVE, root)
    box("Chassis_Bot", col, (0, -0.02, -0.035), (0.068, 0.36, 0.05), TAN, root)
    cyl("Barrel", col, (0, -0.55, 0.02), 0.012, 0.55, BLACK, root, rot=(math.pi / 2, 0, 0), verts=12)
    cyl("Muzzle_Brake", col, (0, -0.88, 0.02), 0.02, 0.06, STEEL, root, rot=(math.pi / 2, 0, 0))
    # Scope
    cyl("Scope", col, (0, -0.12, 0.11), 0.03, 0.28, BLACK, root, rot=(math.pi / 2, 0, 0), verts=14)
    cyl("Scope_Obj", col, (0, -0.28, 0.11), 0.036, 0.035, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Scope_Ocular", col, (0, 0.04, 0.11), 0.034, 0.03, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Mount_F", col, (0, -0.2, 0.07), (0.028, 0.035, 0.035), STEEL, root)
    box("Mount_R", col, (0, -0.04, 0.07), (0.028, 0.035, 0.035), STEEL, root)
    box("Bolt", col, (0.04, 0.1, 0.04), (0.07, 0.018, 0.018), STEEL, root)
    box("Mag", col, (0, 0.0, -0.08), (0.045, 0.07, 0.08), BLACK, root)
    box("Grip", col, (0, 0.14, -0.07), (0.05, 0.065, 0.12), OLIVE, root, rot=(0.4, 0, 0))
    box("Stock", col, (0, 0.32, 0.0), (0.055, 0.26, 0.06), TAN, root)
    box("Cheek", col, (0, 0.26, 0.05), (0.06, 0.12, 0.04), OLIVE, root)
    box("Butt", col, (0, 0.46, -0.015), (0.07, 0.035, 0.13), OLIVE, root)
    # Folded bipod
    box("Bipod_Clamp", col, (0, -0.42, 0.009), (0.034, 0.024, 0.022), STEEL, root)
    box("Bipod_Bar", col, (0, -0.42, -0.003), (0.056, 0.014, 0.01), STEEL, root)
    box("Leg_L", col, (-0.024, -0.42, -0.04), (0.012, 0.012, 0.072), BLACK, root)
    box("Leg_R", col, (0.024, -0.42, -0.04), (0.012, 0.012, 0.072), BLACK, root)

    export_collection(col, root, PUBLIC / "sniper.glb")
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "sniper.blend"))
    print("Exported sniper.glb")
    return root


# Build one weapon at a time so each .blend is saved cleanly, then clear between.
builders = [
    ("pistol", build_pistol),
    ("deagle", build_deagle),
    ("revolver", build_revolver),
    ("machinepistol", build_machinepistol),
    ("shotgun", build_shotgun),
    ("sniper", build_sniper),
]

for weapon_id, builder in builders:
    # Clear previous weapon objects/collections but keep materials.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    builder()

print("All six sidearm/long-gun models exported.")
