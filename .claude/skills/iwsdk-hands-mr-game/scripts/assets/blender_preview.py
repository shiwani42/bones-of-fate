"""Render a 3/4 preview of a GLB: blender -b -P tools/freegen/preview.py -- in.glb out.png"""
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in objs:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
ctr = (mn + mx) / 2; r = (mx - mn).length
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 24; sc.cycles.device = "CPU"
sc.render.resolution_x = sc.render.resolution_y = 560
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam)
cam.location = ctr + Vector((0.55, -1.0, 0.35)) * r * 1.25
cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler(); sc.camera = cam
for loc, e in [((2, -2, 3), 600), ((-2, -1, 1), 200)]:
    l = bpy.data.objects.new("l", bpy.data.lights.new("l", "AREA")); l.data.energy = e * r * r; l.data.size = r
    l.location = ctr + Vector(loc) * r; l.rotation_euler = (ctr - l.location).to_track_quat("-Z", "Y").to_euler(); sc.collection.objects.link(l)
w = bpy.data.worlds.new("w"); w.color = (0.12, 0.11, 0.1); sc.world = w
sc.render.filepath = a[1]; bpy.ops.render.render(write_still=True)
print("TRIS", sum(len(o.data.polygons) for o in objs), "SIZE", [round(x, 3) for x in (mx - mn)])
