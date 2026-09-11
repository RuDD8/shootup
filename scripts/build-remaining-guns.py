"""Build Blender models for every remaining procedural gun.

Convention: muzzle faces Blender -Y. mountWeaponModel applies yaw=π for -Z aim.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets/models"
PUBLIC = ROOT / "public/models"

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


def export_weapon(weapon_id, build_fn):
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)

    col = bpy.data.collections.new(weapon_id.title())
    scene.collection.children.link(col)
    root = empty(f"{weapon_id.title()}_Root", col)
    root["weapon_id"] = weapon_id
    build_fn(col, root)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in col.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    PUBLIC.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(PUBLIC / f"{weapon_id}.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / f"{weapon_id}.blend"))
    print(f"Exported {weapon_id}.glb")


STEEL = material("G_Steel", (0.42, 0.45, 0.5), 0.28, 0.75)
DARK = material("G_Dark", (0.08, 0.09, 0.1), 0.55, 0.4)
BODY = material("G_Body", (0.16, 0.18, 0.2), 0.45, 0.4)
RAIL = material("G_Rail", (0.2, 0.22, 0.24), 0.4, 0.5)
TAN = material("G_Tan", (0.55, 0.45, 0.28), 0.65, 0.05)
GREEN = material("G_Green", (0.18, 0.28, 0.16), 0.7, 0.08)
WOOD = material("G_Wood", (0.38, 0.22, 0.1), 0.7, 0.05)
WOOD_DARK = material("G_WoodDark", (0.22, 0.12, 0.05), 0.75, 0.04)
BLACK = material("G_Black", (0.04, 0.04, 0.045), 0.5, 0.3)
BRASS = material("G_Brass", (0.72, 0.55, 0.22), 0.35, 0.7)
GLOW = material("G_Glow", (0.85, 0.15, 0.1), 0.4, 0.2)
CYAN = material("G_Cyan", (0.05, 0.55, 0.65), 0.25, 0.4)
WHITE = material("G_White", (0.85, 0.88, 0.92), 0.3, 0.5)
OLIVE = material("G_Olive", (0.28, 0.32, 0.18), 0.7, 0.08)
POLYMER = material("G_Polymer", (0.12, 0.13, 0.14), 0.75, 0.05)
GRIP = material("G_Grip", (0.14, 0.12, 0.1), 0.85, 0.02)


def grip_box(col, root, y=0.1, z=-0.07, mat=GRIP):
    box("Grip", col, (0, y, z), (0.05, 0.065, 0.12), mat, root, rot=(0.4, 0, 0))


def stock(col, root, y=0.28, mat=BODY):
    box("Stock", col, (0, y, 0.0), (0.05, 0.16, 0.06), mat, root)
    box("Butt", col, (0, y + 0.1, -0.01), (0.06, 0.03, 0.11), DARK, root)


# ── SMGs ─────────────────────────────────────────────────────────────────────
def build_smg(col, root):
    box("Upper", col, (0, -0.02, 0.03), (0.068, 0.26, 0.068), BODY, root)
    box("Handguard", col, (0, -0.24, 0.02), (0.072, 0.16, 0.065), RAIL, root)
    box("Rail", col, (0, -0.1, 0.07), (0.04, 0.3, 0.015), RAIL, root)
    cyl("Barrel", col, (0, -0.42, 0.02), 0.012, 0.18, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.52, 0.02), 0.018, 0.04, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Mag", col, (0, -0.02, -0.1), (0.04, 0.065, 0.16), DARK, root)
    grip_box(col, root)
    cyl("Stock_Tube", col, (0, 0.18, 0.01), 0.014, 0.12, STEEL, root, rot=(math.pi / 2, 0, 0))
    stock(col, root, 0.3)
    box("RearSightL", col, (-0.016, 0.05, 0.088), (0.012, 0.012, 0.028), STEEL, root)
    box("RearSightR", col, (0.016, 0.05, 0.088), (0.012, 0.012, 0.028), STEEL, root)
    box("FrontSight", col, (0, -0.28, 0.09), (0.012, 0.012, 0.03), GLOW, root)


def build_p90(col, root):
    box("Body", col, (0, -0.02, 0.02), (0.075, 0.36, 0.08), BODY, root)
    box("Shell", col, (0, 0.0, -0.01), (0.07, 0.32, 0.06), POLYMER, root)
    box("TopMag", col, (0, -0.04, 0.07), (0.065, 0.26, 0.03), DARK, root)
    box("Sight", col, (0, -0.06, 0.1), (0.05, 0.08, 0.03), RAIL, root)
    box("Reticle", col, (0, -0.09, 0.108), (0.03, 0.01, 0.025), GLOW, root)
    cyl("Barrel", col, (0, -0.26, 0.015), 0.012, 0.12, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Muzzle", col, (0, -0.33, 0.015), 0.018, 0.03, BODY, root, rot=(math.pi / 2, 0, 0))
    box("Foregrip", col, (0, -0.1, -0.055), (0.04, 0.06, 0.06), POLYMER, root)
    box("Backplate", col, (0, 0.18, 0.01), (0.06, 0.03, 0.08), BODY, root)
    box("Ejection", col, (0.042, -0.12, 0.01), (0.02, 0.06, 0.035), GLOW, root)


def build_vector(col, root):
    box("Upper", col, (0, -0.02, 0.04), (0.065, 0.22, 0.065), BODY, root)
    box("Lower", col, (0, 0.0, -0.02), (0.07, 0.2, 0.08), BODY, root)
    box("Rail", col, (0, -0.02, 0.08), (0.04, 0.26, 0.015), RAIL, root)
    cyl("Barrel", col, (0, -0.24, 0.035), 0.011, 0.16, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.34, 0.035), 0.018, 0.04, BODY, root, rot=(math.pi / 2, 0, 0))
    box("Mag", col, (0, 0.0, -0.12), (0.04, 0.06, 0.14), DARK, root)
    grip_box(col, root, 0.12, -0.08)
    box("VGrip", col, (0, -0.14, -0.06), (0.035, 0.035, 0.07), GRIP, root)
    box("Stock", col, (0, 0.2, 0.01), (0.04, 0.14, 0.05), TAN, root)
    box("Charge", col, (0, 0.05, 0.06), (0.08, 0.02, 0.018), BODY, root)


# ── Rifles ───────────────────────────────────────────────────────────────────
def build_battlerifle(col, root):
    box("Upper", col, (0, -0.04, 0.04), (0.075, 0.32, 0.075), BODY, root)
    box("Lower", col, (0, -0.02, -0.02), (0.07, 0.28, 0.06), RAIL, root)
    box("Handguard", col, (0, -0.32, 0.02), (0.078, 0.2, 0.075), TAN, root)
    box("TopRail", col, (0, -0.32, 0.065), (0.05, 0.18, 0.018), RAIL, root)
    cyl("Barrel", col, (0, -0.58, 0.025), 0.015, 0.32, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.76, 0.025), 0.022, 0.05, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Mag", col, (0, -0.02, -0.13), (0.05, 0.085, 0.16), DARK, root)
    grip_box(col, root, 0.14, -0.08)
    cyl("Buffer", col, (0, 0.2, 0.015), 0.02, 0.16, STEEL, root, rot=(math.pi / 2, 0, 0))
    stock(col, root, 0.34, TAN)
    box("Carry", col, (0, -0.06, 0.085), (0.04, 0.12, 0.01), RAIL, root)


def build_burstrifle(col, root):
    box("Upper", col, (0, -0.02, 0.04), (0.07, 0.28, 0.065), BODY, root)
    box("Lower", col, (0, 0.0, -0.015), (0.066, 0.24, 0.055), RAIL, root)
    box("Handguard", col, (0, -0.28, 0.01), (0.08, 0.2, 0.06), TAN, root)
    cyl("Barrel", col, (0, -0.52, 0.02), 0.013, 0.26, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.67, 0.02), 0.02, 0.04, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Carry", col, (0, -0.02, 0.08), (0.044, 0.14, 0.01), RAIL, root)
    box("SightL", col, (-0.016, -0.06, 0.1), (0.012, 0.012, 0.04), RAIL, root)
    box("SightR", col, (0.016, -0.06, 0.1), (0.012, 0.012, 0.04), RAIL, root)
    box("Mag", col, (0, 0.0, -0.12), (0.042, 0.075, 0.13), DARK, root)
    grip_box(col, root)
    cyl("Buffer", col, (0, 0.18, 0.01), 0.016, 0.14, STEEL, root, rot=(math.pi / 2, 0, 0))
    stock(col, root, 0.3)


def build_dmr(col, root):
    box("Chassis", col, (0, -0.06, 0.02), (0.07, 0.38, 0.068), BODY, root)
    box("Lower", col, (0, -0.04, -0.03), (0.066, 0.34, 0.05), TAN, root)
    cyl("Barrel", col, (0, -0.5, 0.02), 0.014, 0.44, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.74, 0.02), 0.022, 0.05, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Scope", col, (0, -0.1, 0.1), 0.022, 0.2, BLACK, root, rot=(math.pi / 2, 0, 0))
    cyl("ScopeObj", col, (0, -0.22, 0.1), 0.028, 0.03, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("MountF", col, (0, -0.16, 0.07), (0.024, 0.03, 0.03), STEEL, root)
    box("MountR", col, (0, -0.04, 0.07), (0.024, 0.03, 0.03), STEEL, root)
    box("Mag", col, (0, 0.0, -0.08), (0.042, 0.065, 0.1), BODY, root)
    grip_box(col, root, 0.12, -0.08)
    stock(col, root, 0.28, TAN)
    box("Cheek", col, (0, 0.22, 0.045), (0.055, 0.1, 0.035), BODY, root)
    box("BipodL", col, (-0.022, -0.38, -0.035), (0.012, 0.012, 0.065), STEEL, root)
    box("BipodR", col, (0.022, -0.38, -0.035), (0.012, 0.012, 0.065), STEEL, root)


def build_carbine(col, root):
    box("Upper", col, (0, -0.02, 0.035), (0.065, 0.22, 0.065), RAIL, root)
    box("Lower", col, (0, 0.0, -0.015), (0.062, 0.2, 0.055), BODY, root)
    box("Handguard", col, (0, -0.22, 0.01), (0.068, 0.15, 0.06), GREEN, root)
    cyl("Barrel", col, (0, -0.38, 0.02), 0.012, 0.16, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.48, 0.02), 0.018, 0.035, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Mag", col, (0, 0.0, -0.1), (0.04, 0.065, 0.11), DARK, root)
    grip_box(col, root, 0.1, -0.07)
    cyl("Buffer", col, (0, 0.16, 0.01), 0.014, 0.1, STEEL, root, rot=(math.pi / 2, 0, 0))
    stock(col, root, 0.26, GREEN)
    box("RedDot", col, (0, -0.02, 0.085), (0.04, 0.06, 0.035), RAIL, root)
    box("Reticle", col, (0, -0.02, 0.105), (0.012, 0.012, 0.012), GLOW, root)


# ── Shotguns ─────────────────────────────────────────────────────────────────
def build_autoshotgun(col, root):
    box("Receiver", col, (0, 0.0, 0.025), (0.08, 0.24, 0.09), BODY, root)
    cyl("Barrel", col, (0, -0.36, 0.035), 0.024, 0.34, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.54, 0.035), 0.028, 0.04, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Gas", col, (0, -0.28, 0.07), 0.012, 0.2, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Mag", col, (0, 0.0, -0.1), (0.055, 0.08, 0.12), DARK, root)
    box("Handguard", col, (0, -0.22, -0.02), (0.08, 0.14, 0.06), WOOD, root)
    grip_box(col, root, 0.1, -0.06, WOOD)
    stock(col, root, 0.26, WOOD)
    box("Bead", col, (0, -0.5, 0.075), (0.014, 0.014, 0.02), GLOW, root)


def build_slugshotgun(col, root):
    box("Receiver", col, (0, -0.02, 0.025), (0.078, 0.28, 0.088), BODY, root)
    cyl("Barrel", col, (0, -0.46, 0.035), 0.024, 0.46, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Muzzle", col, (0, -0.7, 0.035), 0.028, 0.04, BRASS, root, rot=(math.pi / 2, 0, 0))
    cyl("Tube", col, (0, -0.36, -0.01), 0.015, 0.32, BODY, root, rot=(math.pi / 2, 0, 0))
    box("Pump", col, (0, -0.3, -0.03), (0.082, 0.14, 0.065), WOOD, root)
    grip_box(col, root, 0.1, -0.06, WOOD)
    stock(col, root, 0.26, WOOD)
    box("RearSightL", col, (-0.014, 0.04, 0.095), (0.012, 0.012, 0.025), STEEL, root)
    box("RearSightR", col, (0.014, 0.04, 0.095), (0.012, 0.012, 0.025), STEEL, root)
    box("FrontSight", col, (0, -0.64, 0.075), (0.014, 0.014, 0.024), BRASS, root)


def build_doublebarrel(col, root):
    box("Receiver", col, (0, 0.0, 0.025), (0.09, 0.16, 0.08), BODY, root)
    cyl("BarrelL", col, (-0.022, -0.38, 0.035), 0.022, 0.44, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("BarrelR", col, (0.022, -0.38, 0.035), 0.022, 0.44, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Rib", col, (0, -0.36, 0.062), (0.015, 0.4, 0.008), BODY, root)
    cyl("RingL", col, (-0.022, -0.6, 0.035), 0.026, 0.02, BRASS, root, rot=(math.pi / 2, 0, 0))
    cyl("RingR", col, (0.022, -0.6, 0.035), 0.026, 0.02, BRASS, root, rot=(math.pi / 2, 0, 0))
    cyl("Hinge", col, (0, -0.1, 0.06), 0.016, 0.08, BRASS, root, rot=(0, math.pi / 2, 0))
    box("Bead", col, (0, -0.58, 0.075), (0.012, 0.012, 0.018), BRASS, root)
    grip_box(col, root, 0.08, -0.06, WOOD)
    stock(col, root, 0.26, WOOD)


def build_sawedoff(col, root):
    box("Receiver", col, (0, 0.0, 0.025), (0.088, 0.14, 0.08), BODY, root)
    cyl("BarrelL", col, (-0.02, -0.18, 0.035), 0.022, 0.22, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("BarrelR", col, (0.02, -0.18, 0.035), 0.022, 0.22, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Rib", col, (0, -0.16, 0.06), (0.014, 0.18, 0.008), BODY, root)
    grip_box(col, root, 0.06, -0.07, WOOD)
    box("PistolStock", col, (0, 0.12, -0.02), (0.06, 0.08, 0.08), WOOD_DARK, root)


# ── Snipers ──────────────────────────────────────────────────────────────────
def build_scout(col, root):
    box("Chassis", col, (0, -0.04, 0.015), (0.062, 0.34, 0.06), BODY, root)
    box("Lower", col, (0, -0.02, -0.03), (0.06, 0.3, 0.045), TAN, root)
    cyl("Barrel", col, (0, -0.48, 0.02), 0.01, 0.42, BLACK, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.72, 0.02), 0.016, 0.04, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Scope", col, (0, -0.1, 0.1), 0.024, 0.22, BLACK, root, rot=(math.pi / 2, 0, 0))
    cyl("ScopeObj", col, (0, -0.23, 0.1), 0.03, 0.03, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Bolt", col, (0.04, 0.08, 0.035), (0.06, 0.016, 0.016), STEEL, root)
    box("Mag", col, (0, 0.0, -0.06), (0.038, 0.055, 0.06), BLACK, root)
    grip_box(col, root, 0.12, -0.08, BODY)
    stock(col, root, 0.28, TAN)


def build_awp(col, root):
    box("Chassis", col, (0, -0.08, 0.018), (0.075, 0.46, 0.075), BODY, root)
    box("Lower", col, (0, -0.06, -0.038), (0.072, 0.4, 0.055), TAN, root)
    cyl("Barrel", col, (0, -0.64, 0.022), 0.014, 0.58, BLACK, root, rot=(math.pi / 2, 0, 0))
    cyl("Brake", col, (0, -0.98, 0.022), 0.024, 0.07, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Scope", col, (0, -0.14, 0.115), 0.035, 0.32, BLACK, root, rot=(math.pi / 2, 0, 0))
    cyl("ScopeObj", col, (0, -0.32, 0.115), 0.042, 0.04, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("MountF", col, (0, -0.24, 0.075), (0.03, 0.04, 0.04), STEEL, root)
    box("MountR", col, (0, -0.04, 0.075), (0.03, 0.04, 0.04), STEEL, root)
    box("Bolt", col, (0.05, 0.12, 0.045), (0.075, 0.02, 0.02), STEEL, root)
    box("Mag", col, (0, 0.0, -0.09), (0.05, 0.075, 0.09), BLACK, root)
    grip_box(col, root, 0.15, -0.09)
    stock(col, root, 0.34, TAN)
    box("Cheek", col, (0, 0.28, 0.055), (0.065, 0.14, 0.045), BODY, root)
    box("BipodL", col, (-0.026, -0.5, -0.044), (0.012, 0.012, 0.08), BLACK, root)
    box("BipodR", col, (0.026, -0.5, -0.044), (0.012, 0.012, 0.08), BLACK, root)


# ── Heavy / exotic ───────────────────────────────────────────────────────────
def build_lmg(col, root):
    box("Receiver", col, (0, -0.02, 0.035), (0.08, 0.32, 0.08), BODY, root)
    box("Lower", col, (0, 0.0, -0.02), (0.076, 0.28, 0.065), RAIL, root)
    cyl("Barrel", col, (0, -0.52, 0.025), 0.016, 0.36, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("HeatShield", col, (0, -0.38, 0.025), (0.06, 0.2, 0.05), RAIL, root)
    cyl("Brake", col, (0, -0.74, 0.025), 0.024, 0.06, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Carry", col, (0, -0.14, 0.09), (0.025, 0.14, 0.012), STEEL, root)
    box("AmmoBox", col, (0, -0.02, -0.12), (0.07, 0.1, 0.1), DARK, root)
    box("Feed", col, (0, -0.02, 0.08), (0.082, 0.14, 0.02), BODY, root)
    grip_box(col, root, 0.14, -0.08)
    cyl("Buffer", col, (0, 0.2, 0.015), 0.018, 0.14, STEEL, root, rot=(math.pi / 2, 0, 0))
    stock(col, root, 0.34)
    box("BipodL", col, (-0.028, -0.5, -0.045), (0.012, 0.012, 0.08), BODY, root)
    box("BipodR", col, (0.028, -0.5, -0.045), (0.012, 0.012, 0.08), BODY, root)


def build_minigun(col, root):
    cyl("Housing", col, (0, 0.04, 0.02), 0.06, 0.14, BODY, root, rot=(math.pi / 2, 0, 0), verts=16)
    box("Motor", col, (0, 0.12, 0.02), (0.05, 0.08, 0.08), DARK, root)
    for i in range(6):
        a = i * (math.pi * 2 / 6)
        cyl(
            f"Barrel_{i}", col,
            (math.cos(a) * 0.032, -0.28, 0.02 + math.sin(a) * 0.032),
            0.008, 0.4, STEEL, root, rot=(math.pi / 2, 0, 0), verts=8,
        )
    cyl("ClampF", col, (0, -0.1, 0.02), 0.055, 0.025, BODY, root, rot=(math.pi / 2, 0, 0), verts=16)
    cyl("ClampR", col, (0, -0.35, 0.02), 0.055, 0.025, BODY, root, rot=(math.pi / 2, 0, 0), verts=16)
    cyl("Flash", col, (0, -0.49, 0.02), 0.05, 0.03, BRASS, root, rot=(math.pi / 2, 0, 0))
    box("GripL", col, (-0.03, 0.1, -0.06), (0.04, 0.06, 0.1), GRIP, root)
    box("GripR", col, (0.03, 0.1, -0.06), (0.04, 0.06, 0.1), GRIP, root)
    box("AmmoFeed", col, (0.06, -0.04, -0.04), (0.08, 0.08, 0.08), BODY, root)


def build_crossbow(col, root):
    box("Stock", col, (0, 0.08, 0.0), (0.05, 0.28, 0.06), WOOD, root)
    box("Rail", col, (0, -0.08, 0.03), (0.04, 0.22, 0.03), BODY, root)
    box("ProdL", col, (-0.14, -0.2, 0.03), (0.22, 0.03, 0.025), WOOD, root, rot=(0, 0, 0.35))
    box("ProdR", col, (0.14, -0.2, 0.03), (0.22, 0.03, 0.025), WOOD, root, rot=(0, 0, -0.35))
    box("String", col, (0, -0.05, 0.03), (0.28, 0.004, 0.004), WHITE, root)
    box("Bolt", col, (0, -0.12, 0.045), (0.012, 0.28, 0.012), STEEL, root)
    box("Tip", col, (0, -0.28, 0.045), (0.02, 0.04, 0.02), STEEL, root)
    grip_box(col, root, 0.12, -0.07, WOOD)
    box("Scope", col, (0, 0.0, 0.09), (0.04, 0.08, 0.04), BLACK, root)


def build_leveraction(col, root):
    box("Receiver", col, (0, 0.0, 0.02), (0.07, 0.2, 0.08), BRASS, root)
    cyl("Barrel", col, (0, -0.4, 0.04), 0.014, 0.5, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Tube", col, (0, -0.32, -0.005), 0.012, 0.32, STEEL, root, rot=(math.pi / 2, 0, 0))
    box("Lever", col, (0, 0.04, -0.08), (0.012, 0.08, 0.1), BRASS, root, rot=(0.6, 0, 0))
    box("Hammer", col, (0, 0.08, 0.07), (0.02, 0.03, 0.04), STEEL, root)
    grip_box(col, root, 0.1, -0.06, WOOD)
    stock(col, root, 0.28, WOOD)
    box("Forestock", col, (0, -0.2, -0.02), (0.06, 0.16, 0.05), WOOD, root)
    box("FrontSight", col, (0, -0.62, 0.07), (0.012, 0.012, 0.02), BRASS, root)


def build_laser(col, root):
    box("Body", col, (0, -0.02, 0.035), (0.065, 0.28, 0.06), WHITE, root)
    box("Dark", col, (0, 0.0, -0.01), (0.06, 0.24, 0.05), DARK, root)
    cyl("Emitter", col, (0, -0.24, 0.03), 0.02, 0.14, STEEL, root, rot=(math.pi / 2, 0, 0))
    cyl("Tip", col, (0, -0.32, 0.03), 0.025, 0.03, CYAN, root, rot=(math.pi / 2, 0, 0))
    box("Panel", col, (0, -0.04, 0.07), (0.068, 0.12, 0.015), CYAN, root)
    box("SideL", col, (-0.038, -0.06, 0.03), (0.015, 0.16, 0.04), CYAN, root)
    box("SideR", col, (0.038, -0.06, 0.03), (0.015, 0.16, 0.04), CYAN, root)
    box("Pack", col, (0, 0.16, 0.02), (0.06, 0.1, 0.065), DARK, root)
    box("Core", col, (0, 0.16, 0.04), (0.04, 0.08, 0.04), CYAN, root)
    grip_box(col, root, 0.08, -0.05, GRIP)
    box("Vent1", col, (0, -0.14, 0.065), (0.07, 0.02, 0.008), CYAN, root)
    box("Vent2", col, (0, -0.18, 0.065), (0.07, 0.02, 0.008), CYAN, root)


WEAPONS = [
    ("smg", build_smg),
    ("p90", build_p90),
    ("vector", build_vector),
    ("battlerifle", build_battlerifle),
    ("burstrifle", build_burstrifle),
    ("dmr", build_dmr),
    ("carbine", build_carbine),
    ("autoshotgun", build_autoshotgun),
    ("slugshotgun", build_slugshotgun),
    ("doublebarrel", build_doublebarrel),
    ("sawedoff", build_sawedoff),
    ("scout", build_scout),
    ("awp", build_awp),
    ("lmg", build_lmg),
    ("minigun", build_minigun),
    ("crossbow", build_crossbow),
    ("leveraction", build_leveraction),
    ("laser", build_laser),
]

for weapon_id, builder in WEAPONS:
    export_weapon(weapon_id, builder)

print(f"Exported {len(WEAPONS)} remaining gun models.")
