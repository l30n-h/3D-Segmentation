'use strict';

var renderSurface = document.getElementById("renderSurface");
function getSurfaceWidth() {
	return renderSurface.offsetWidth;
}
function getSurfaceHeight() {
	return renderSurface.offsetHeight;
}
var renderer = new THREE.WebGLRenderer();
var camera = new THREE.PerspectiveCamera(45, getSurfaceWidth() / getSurfaceHeight(), 0.1, 500);
var controls;
var raycaster = new THREE.Raycaster();
var mousePos = new THREE.Vector2(), INTERSECTED, doRaycast = false;
var scene = new THREE.Scene();

renderer.setSize(getSurfaceWidth(), getSurfaceHeight());
renderer.setPixelRatio(window.devicePixelRatio);
renderSurface.appendChild(renderer.domElement);

var needsRerendering = true;
var voxelSize = 1;

var material = new THREE.LineBasicMaterial({ color: 0x0000ff });
var geometry = new THREE.Geometry();
var line = new THREE.Line(geometry, material);


function VoxelMap(...values) {

	var voxel = new Map();

	this.get = (x, y, z) => {
		return this.getByKey(this.getKey(x, y, z));
	}

	this.set = (x, y, z, v) => {
		this.setByKey(this.getKey(x, y, z), v);
	}

	this.remove = (x, y, z) => {
		this.removeByKey(this.getKey(x, y, z));
	}

	this.getByKey = (k) => {
		return voxel.get(k);
	}

	this.setByKey = (k, v) => {
		voxel.set(k, v);
	}

	this.removeByKey = (key) => {
		voxel.delete(key);
	}

	this.size = () => {
		return voxel.size;
	}

	this.clear = () => {
		voxel.clear();
	}

	this.entries = () => {
		return voxel.entries();
	}

	this.values = () => {
		return voxel.values();
	}

	this.keys = () => {
		return voxel.keys();
	}

	this.getPosition = (key) => {
		var s = key.split("/");
		if (!s || s.length < 3) return null;
		return {
			x: parseInt(s[0]),
			y: parseInt(s[1]),
			z: parseInt(s[2])
		}
	}

	this.getKey = (x, y, z) => {
		return x + "/" + y + "/" + z;
	}

	if (values) values.forEach((v) => this.set(v.x, v.y, v.z, v));
}

function VertexGeometry(cubes = true) {
	var boxSize = voxelSize * 0 + 0.7;
	var vboMap = new VoxelMap();

	this.add = (position, voxel) => {
		var p = getVBOPosition(position);
		var vbo = vboMap.get(p.x, p.y, p.z);
		if (!vbo) {
			vbo = { vertices: [], colors: [], geo: new THREE.BufferGeometry() };
			vboMap.set(p.x, p.y, p.z, vbo);
		}
		var vboIndex = Math.floor(vbo.vertices.length / 3);
		var vboLength;
		if (cubes) {
			vboIndex *= 8;
			vboLength = 8;
			vbo.vertices.push(position.x, position.y, position.z);
		} else {
			if (voxel.vertices) {
				vboLength = voxel.vertices.length;
				voxel.vertices.forEach(v => {
					vbo.vertices.push(v.x, v.y, v.z);
					vbo.colors.push(1, 0, 0);
				});
			} else {
				vboLength = 1;
				vbo.vertices.push(position.x, position.y, position.z);
			}
		}
		vbo.colors.push(1, 0, 0);
		return { vbo: vbo.geo, vboIndex: vboIndex, vboLength };
	}

	this.dispose = () => {
		vboMap.clear();
		vboMap = null;
	}

	this.drawnObjects = () => {
		if (cubes) return Array.from(vboMap.entries()).map((e) => getCubeMesh(e[1]));
		return Array.from(vboMap.entries()).map((e) => getPointsMesh(e[1]));
	}

	function getVBOPosition(p) {
		return { x: Math.floor(p.x / 10), y: Math.floor(p.y / 10), z: Math.floor(p.z / 10) }
	}

	function getCubeMesh(vbo) {
		var hbs = boxSize / 2;
		var vertices = new Float32Array(vbo.vertices.length * 8);
		for (var i = 0; i < vbo.vertices.length; i += 3) {
			var x = vbo.vertices[i];
			var y = vbo.vertices[i + 1];
			var z = vbo.vertices[i + 2];
			var i8 = i * 8;
			vertices[i8] = vertices[i8 + 3] = vertices[i8 + 6] = vertices[i8 + 9] = x - hbs;
			vertices[i8 + 1] = vertices[i8 + 4] = vertices[i8 + 13] = vertices[i8 + 16] = y - hbs;
			vertices[i8 + 2] = vertices[i8 + 8] = vertices[i8 + 14] = vertices[i8 + 20] = z - hbs;
			vertices[i8 + 12] = vertices[i8 + 15] = vertices[i8 + 18] = vertices[i8 + 21] = x + hbs;
			vertices[i8 + 7] = vertices[i8 + 10] = vertices[i8 + 19] = vertices[i8 + 22] = y + hbs;
			vertices[i8 + 5] = vertices[i8 + 11] = vertices[i8 + 17] = vertices[i8 + 23] = z + hbs;
		}
		var colors = new Float32Array(vbo.vertices.length * 8);
		for (var i = 0; i < Math.min(vbo.colors.length, vbo.vertices.length); i += 3) {
			var r = vbo.colors[i];
			var g = vbo.colors[i + 1];
			var b = vbo.colors[i + 2];
			var i8 = i * 8;
			for (var j = 0; j < 24; j += 3) {
				colors[i8 + j] = r;
				colors[i8 + j + 1] = g;
				colors[i8 + j + 2] = b;
			}
		}

		var indices = new Uint32Array(Math.floor(vbo.vertices.length / 3) * 16 - 2);
		for (var i = 0, o = 0; i < indices.length; i += 16, o += 8) {
			indices[i] = indices[i + 7] = 2 + o;
			indices[i + 1] = 6 + o;
			indices[i + 2] = indices[i + 9] = 0 + o;
			indices[i + 3] = 4 + o;
			indices[i + 4] = indices[i + 11] = 5 + o;
			indices[i + 5] = 6 + o;
			indices[i + 6] = indices[i + 13] = 7 + o;
			indices[i + 8] = indices[i + 12] = 3 + o;
			indices[i + 10] = 1 + o;
			if (i + 14 < indices.length) {
				indices[i + 14] = indices[i + 13];
				indices[i + 15] = 10 + o;
			}
		}

		vbo.geo.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
		vbo.geo.addAttribute('color', new THREE.BufferAttribute(colors, 3));
		vbo.geo.setIndex(new THREE.BufferAttribute(indices, 1));
		var m = new THREE.Mesh(vbo.geo, new THREE.MeshBasicMaterial({ vertexColors: THREE.VertexColors }));
		m.drawMode = THREE.TriangleStripDrawMode;
		return m;
	}

	function getPointsMesh(vbo) {
		vbo.geo.addAttribute('position', new THREE.BufferAttribute(new Float32Array(vbo.vertices), 3));
		vbo.geo.addAttribute('color', new THREE.BufferAttribute(new Float32Array(vbo.colors), 3));
		return new THREE.Points(vbo.geo, new THREE.PointsMaterial({ vertexColors: THREE.VertexColors, size: 10 }));
	}
}

function Frustum(eye, dir, up, near, far, top, bottom, right, left) {
	dir = new THREE.Vector3().add(dir).normalize();
	up = new THREE.Vector3().add(up);
	var side = new THREE.Vector3().crossVectors(dir, up).normalize();
	up.crossVectors(side, dir).normalize();
	var vn = new THREE.Vector3().addScaledVector(dir, near);
	var vf = new THREE.Vector3().addScaledVector(dir, far);
	var vt = new THREE.Vector3().add(vn).addScaledVector(up, top);
	var vb = new THREE.Vector3().add(vn).addScaledVector(up, bottom);
	var vr = new THREE.Vector3().add(vn).addScaledVector(side, right);
	var vl = new THREE.Vector3().add(vn).addScaledVector(side, left);
	var nt = new THREE.Vector3().crossVectors(side, vt).normalize();
	var nb = new THREE.Vector3().crossVectors(vb, side).normalize();
	var nr = new THREE.Vector3().crossVectors(vr, up).normalize();
	var nl = new THREE.Vector3().crossVectors(up, vl).normalize();
	vn.add(eye);
	vf.add(eye);
	vt.add(eye);
	vb.add(eye);
	vr.add(eye);
	vl.add(eye);

	function dot(a, b) {
		return a.x * b.x + a.y * b.y + a.z * b.z;
	}

	this.plane = {};
	this.plane.near = { x: -dir.x, y: -dir.y, z: -dir.z, d: -dot(dir, vn) };
	this.plane.far = { x: dir.x, y: dir.y, z: dir.z, d: dot(dir, vf) };
	this.plane.top = { x: nt.x, y: nt.y, z: nt.z, d: dot(nt, vt) };
	this.plane.bottom = { x: nb.x, y: nb.y, z: nb.z, d: dot(nb, vb) };
	this.plane.right = { x: nr.x, y: nr.y, z: nr.z, d: dot(nr, vr) };
	this.plane.left = { x: nl.x, y: nl.y, z: nl.z, d: dot(nl, vl) };
	this.containsVoxel = (v, radius) => {
		for (var pk of Object.keys(this.plane)) {
			var p = this.plane[pk];
			if (dot(v, p) > p.d + radius) {
				return false;
			}
		}
		return true;
	}

	this.getVoxels = (voxels) => {
		var nvoxels = new VoxelMap();
		var offset = Math.sqrt(Math.pow(voxelSize, 2) * 3) / 2;
		for (var [key, voxel] of voxels.entries()) {
			var p = voxels.getPosition(key);
			if (this.containsVoxel(p, offset)) {
				nvoxels.setByKey(key, voxel);
			}
		}
		return nvoxels;
	}
}

var voxels = new VoxelMap();
var rasterSize;
var colorType = document.getElementById('colorType').value;
var clickType = document.getElementById('clickType').value;
var positionOffset = { x: 0, y: 0, z: 0 };
var voxelsBounds = {
	min: { x: 0, y: 0, z: 0, value: 0, sx: 0, sy: 0, sz: 0 },
	max: { x: 0, y: 0, z: 0, value: 0, sx: 0, sy: 0, sz: 0 },
};

function getColor(p, voxel = null) {
	if (!voxel) voxel = voxels.get(p.x, p.y, p.z);
	var red = 0, green = 0, blue = 0, vc;
	if (colorType == "xyz") {
		red = incContrast(p.x, voxelsBounds.min.x, voxelsBounds.max.x, 30, 225);
		green = incContrast(p.y, voxelsBounds.min.y, voxelsBounds.max.y, 30, 225);
		blue = incContrast(p.z, voxelsBounds.min.z, voxelsBounds.max.z, 30, 225);
	} else if (colorType == "value") {
		vc = incContrast(voxel.value, voxelsBounds.min.value, voxelsBounds.max.value, 30, 225);
		red = green = blue = vc;
	} else if (colorType == "normal") {
		red = incContrast(voxel["sx"] || 0, voxelsBounds.min.sx, voxelsBounds.max.sx, 30, 225);
		green = incContrast(voxel["sy"] || 0, voxelsBounds.min.sy, voxelsBounds.max.sy, 30, 225);
		blue = incContrast(voxel["sz"] || 0, voxelsBounds.min.sz, voxelsBounds.max.sz, 30, 225);
	} else {
		vc = Math.round(Math.floor(incContrast(voxel.value, voxelsBounds.min.value, voxelsBounds.max.value, 30, 225) / 19.5) * 19.5);
		red = green = blue = vc;
	}
	if (voxel.marked) {
		red *= 0.66;
		green *= 0.66;
		blue *= 0.66;
	}
	return {
		r: red,
		g: green,
		b: blue,
		hex: (red << 16) + (green << 8) + blue
	}
}

function setColor(cube, color) {
	var r = color.r / 255;
	var g = color.g / 255;
	var b = color.b / 255;
	var colors = cube.vbo.getAttribute("color");
	if (colors) {
		for (var c = 0; c < cube.vboLength; c++) colors.setXYZ(cube.vboIndex + c, r, g, b);
		colors.needsUpdate = true;
	}
}

function raycastClicked(position) {
	var vp = pointToVoxel(position);
	if (clickType == "floodfill") {
		setTimeout(() => {
			var v2 = null
			var marked = floodFill((p, p1) => {
				// var v = voxels.get(x, y, z);
				// if (!v) return false;
				// return v.value > 0;

				var v1 = voxels.get(p.x, p.y, p.z);
				if (!v1) return false;
				//if (v2 == null) v2 = v1;
				var v2 = voxels.get(p1.x, p1.y, p1.z);
				if (!v2) return false;
				var dot = v1.sx * v2.sx + v1.sy * v2.sy + v1.sz * v2.sz;
				return dot >= 0.98;
			}, vp);

			for (var key of marked.keys()) {
				voxels.getByKey(key)["marked"] = true;
			}
			updateColors();
		}, 0);
	} else if (clickType == "mark") {
		var voxel = voxels.get(vp.x, vp.y, vp.z);
		if (voxel) voxel["marked"] = true;
	} else {
		console.log(vp);
		console.log(voxels.get(vp.x, vp.y, vp.z));
	}
}

function pointToVoxel(p) {
	var vsh = voxelSize / 2 - 0.01;

	return {
		x: Math.floor(p.x + vsh),
		y: Math.floor(p.y + vsh),
		z: Math.floor(p.z + vsh)
	};
}

function clearScene() {
	INTERSECTED = null;
	for (var i = scene.children.length - 1; i >= 0; i--) {
		var child = scene.children[i]
		scene.remove(child);
		if (child instanceof THREE.Mesh) {
			child.geometry.dispose();
			child.material.dispose();
			child.geometry = null;
			child.material = null;
		}
	}
	renderer.render(scene, camera);
}


function clean() {
	clearScene();
	voxels.clear();
}


function init() {
	clearScene();
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.addEventListener('change', (e) => { needsRerendering = true; }, false);
	controls.userPanSpeed = 0.02;
	camera.position.z = 5;

	for (let x = 0; x < 10; x++) {
		for (let y = 0; y < 10; y++) {
			for (let z = 0; z < 10; z++) {
				voxels.set(x, y, z, { value: 1 });
			}
		}
	}

	loadScene();
}

function resize() {
	camera.aspect = getSurfaceWidth() / getSurfaceHeight();
	camera.updateProjectionMatrix();
	renderer.setSize(getSurfaceWidth(), getSurfaceHeight());

	needsRerendering = true;
}

function update() {
	controls.update();
}

function render() {
	if (doRaycast) {
		raycaster.setFromCamera(mousePos, camera);

		var hit_position = []
		var hit_normal = []
		var getVoxel = (x, y, z) => {
			return voxels.get(x, y, z);
		}
		var vsh = voxelSize / 2;
		var min = { x: voxelsBounds.min.x - vsh, y: voxelsBounds.min.y - vsh, z: voxelsBounds.min.z - vsh };
		var max = { x: voxelsBounds.max.x + vsh, y: voxelsBounds.max.y + vsh, z: voxelsBounds.max.z + vsh };
		var hit = raycast(getVoxel, raycaster.ray.origin, raycaster.ray.direction, min, max);
		if (hit) {
			var vp = pointToVoxel(hit.position);
			var voxel = voxels.get(vp.x, vp.y, vp.z);
			if (voxel) {
				if (!INTERSECTED || INTERSECTED["voxel"] != voxel) {
					if (INTERSECTED) setColor(INTERSECTED["voxel"].cube, getColor(INTERSECTED["vp"], INTERSECTED["voxel"]));
					INTERSECTED = {
						voxel: voxel,
						vp: vp
					};
					setColor(voxel.cube, { r: 0, g: 255, b: 0 })
				}
			} else {
				console.log(hit)
			}
		} else {
			if (INTERSECTED) setColor(INTERSECTED["voxel"].cube, getColor(INTERSECTED["vp"], INTERSECTED["voxel"]));
			INTERSECTED = null;
		}
		if (doRaycast == "click") {
			if (hit) {
				raycastClicked(hit.position);
			}
		}
		doRaycast = false;

		needsRerendering = true;
	}
	if (needsRerendering) {
		renderer.render(scene, camera);
		needsRerendering = false;
		//console.log(renderer.info);
	}
};


//MAIN LOOP
var ups = 60;
var framePeriod = 1000 / ups;
var frameRate = 1 / ups;
var cumulatedFrameTime = 0; // ms
var _lastFrameTime = Date.now(); // timestamp
function loop() {
	var time = Date.now();
	var timeDif = (time - _lastFrameTime);
	_lastFrameTime = time;
	cumulatedFrameTime += timeDif;
	var doRendering = cumulatedFrameTime >= framePeriod;
	while (cumulatedFrameTime > framePeriod) {
		cumulatedFrameTime -= framePeriod;
		update();
	}

	if (doRendering) render();

	window.requestAnimationFrame(loop);
}

function loopSimple() {
	render();
	update();
	requestAnimationFrame(loopSimple);
}

window.addEventListener('unload', (event) => {
	clean();
	renderer.dispose();
	renderer.forceContextLoss();
}, false);
window.addEventListener('resize', (event) => {
	resize();
}, false);

window.addEventListener('keydown', (event) => {
	if (event.key == "Shift") controls.deactivate();
})

window.addEventListener('keyup', (event) => {
	if (event.key == "Shift") controls.activate();
})

var mouseDown = false;
renderSurface.addEventListener('mousedown', (event) => {
	setMousePosition(event);
	mouseDown = true;
}, false);
window.addEventListener('mouseup', (event) => {
	mouseDown = false;
}, false);
renderSurface.addEventListener('mousemove', (event) => {
	setMousePosition(event);
}, false);
renderSurface.addEventListener('click', (event) => {
	setMousePosition(event);
}, false);

function setMousePosition(event) {
	var x = ((event.pageX - renderSurface.offsetLeft) / getSurfaceWidth()) * 2 - 1;
	var y = - ((event.pageY - renderSurface.offsetTop) / getSurfaceHeight()) * 2 + 1;
	if (event.ctrlKey) {
		if (mouseDown) doRaycast = "click"
		else if (doRaycast != "click") doRaycast = event.type;
		mousePos.x = x;
		mousePos.y = y;
	}

	else if (event.shiftKey && event.type == "click") {
		var top = Math.tan(camera.fov / 360 * Math.PI) * camera.near;
		var right = top * camera.aspect;
		var frustum = new Frustum(camera.position, camera.getWorldDirection(),
			camera.up, camera.near, camera.far, top, -top, right, -right
		);
		var nvoxels = frustum.getVoxels(voxels);
		for (var key of nvoxels.keys()) {
			voxels.getByKey(key)["marked"] = true;
		}
		updateColors();
	}
}




init();
loopSimple();

function calculateBounds() {
	var minKeys = Object.keys(voxelsBounds.min);
	var maxKeys = Object.keys(voxelsBounds.max);
	minKeys.forEach(v => voxelsBounds.min[v] = Number.POSITIVE_INFINITY);
	maxKeys.forEach(v => voxelsBounds.max[v] = Number.NEGATIVE_INFINITY);

	minKeys = minKeys.filter(v => v != "x" && v != "y" && v != "z");
	maxKeys = maxKeys.filter(v => v != "x" && v != "y" && v != "z");
	var coords = ["x", "y", "z"];
	for (var e of voxels.entries()) {
		var key = e[0];
		var voxel = e[1];
		var v = voxel.value;
		var p = voxels.getPosition(key);
		if (Math.abs(v) > 0.001) {
			coords.forEach(v => {
				voxelsBounds.min[v] = Math.min(voxelsBounds.min[v], p[v]);
				voxelsBounds.max[v] = Math.max(voxelsBounds.max[v], p[v]);
			});
			minKeys.forEach(v => voxelsBounds.min[v] = Math.min(voxelsBounds.min[v], voxel[v] || 0));
			maxKeys.forEach(v => voxelsBounds.max[v] = Math.max(voxelsBounds.max[v], voxel[v] || 0));
		} else {
			voxels.removeByKey(key)
		}
	}
	console.log(voxelsBounds);
	coords.forEach(v => {
		positionOffset[v] = (voxelsBounds.max[v] - voxelsBounds.min[v]) / 2 + voxelsBounds.min[v];
	});

	controls.userPanSpeed = 0.004 * new THREE.Vector3().subVectors(voxelsBounds.max, voxelsBounds.min).length()
	controls.setPosition(positionOffset);
}

function loadScene() {
	clearScene();
	calculateBounds();

	var axisHelper = new THREE.AxisHelper(5);
	scene.add(axisHelper);

	var vGeometry = new VertexGeometry(true);
	var i = 0;
	for (var e of voxels.entries()) {
		var voxel = e[1];
		var key = e[0];
		var p = voxels.getPosition(key);
		var cube = vGeometry.add(p, voxel);
		voxel["cube"] = cube;
		i++;
	}
	vGeometry.drawnObjects().forEach(o => scene.add(o));
	vGeometry.dispose();

	updateColors();
	needsRerendering = true;
}

function updateColors() {
	for (var e of voxels.entries()) {
		var key = e[0];
		var voxel = e[1];
		var v = voxel.value;
		var p = voxels.getPosition(key);
		var color = getColor(p, voxel);
		setColor(voxel.cube, color);
	}
	needsRerendering = true;
}

function incContrast(v, minV, maxV, min, max) {
	return /*Math.floor*/((minV == maxV ? 1 : ((v - minV) / (maxV - minV))) * (max - min) + min);
}

function gauss3D(voxels) {
	return korrelation3D(voxels, [1 / 4, 2 / 4, 1 / 4]);
}

function korrelation1D(voxels, kernel, axis, out = new VoxelMap()) {
	var getPositionByAxis;
	if (axis == "x") getPositionByAxis = (p, o) => ({ x: p.x + o, y: p.y, z: p.z });
	else if (axis == "y") getPositionByAxis = (p, o) => ({ x: p.x, y: p.y + o, z: p.z });
	else getPositionByAxis = (p, o) => ({ x: p.x, y: p.y, z: p.z + o });
	var kh = Math.floor(kernel.length / 2);

	var keys = new Set();
	for (var key of voxels.keys()) {
		var vp = voxels.getPosition(key);
		for (var o = -kh; o < kernel.length - kh; o++) {
			var op = getPositionByAxis(vp, o);
			keys.add(voxels.getKey(op.x, op.y, op.z));
		}
	}

	var getValue = (voxels, x, y, z) => {
		var v = voxels.get(x, y, z);
		if (!v || !v.value) return 0;
		return v.value;
	}

	for (var key of keys.values()) {
		var vp = voxels.getPosition(key);
		var sum = 0;
		kernel.forEach((v, ki) => {
			var p = getPositionByAxis(vp, ki - kh);
			sum += getValue(voxels, p.x, p.y, p.z) * v;
		});
		if (sum != 0) {
			var v = out.getByKey(key);
			if (!v) {
				v = { value: 0 };
				out.setByKey(key, v);
			}
			v.value = sum;
		}
	}
	return out;
}

function korrelation3D(voxels, kernel) {
	var nvoxels = korrelation1D(voxels, kernel, "x");
	var nvoxels2 = korrelation1D(nvoxels, kernel, "y"); nvoxels.clear();
	return korrelation1D(nvoxels2, kernel, "z", nvoxels);
}

function sobel3D(voxels, blur = true) {
	var sx = sobel1D(voxels, "x", blur);
	var sy = sobel1D(voxels, "y", blur);
	var sz = sobel1D(voxels, "z", blur);
	var nvoxels = new VoxelMap();
	function merge(s, name, out) {
		for (var e of s.entries()) {
			if (e[1].value != 0) {
				var key = e[0];
				var voxel = nvoxels.getByKey(key);
				if (!voxel) {
					voxel = {};
					nvoxels.setByKey(key, voxel);
				}
				voxel[name] = e[1].value;
			}
		}
	}
	merge(sx, "sx", nvoxels);
	merge(sy, "sy", nvoxels);
	merge(sz, "sz", nvoxels);
	return nvoxels;
}

function sobel1D(voxels, axis, blur = true) {
	var nvoxels, nvoxels2;
	if (blur) {
		var kernelBlur = [1, 2, 1];
		if (axis == "x") {
			nvoxels = korrelation1D(voxels, kernelBlur, "z");
			nvoxels2 = korrelation1D(nvoxels, kernelBlur, "y"); nvoxels.clear();
		} else if (axis == "y") {
			nvoxels = korrelation1D(voxels, kernelBlur, "x");
			nvoxels2 = korrelation1D(nvoxels, kernelBlur, "z"); nvoxels.clear();
		} else {
			nvoxels = korrelation1D(voxels, kernelBlur, "y");
			nvoxels2 = korrelation1D(nvoxels, kernelBlur, "x"); nvoxels.clear();
		}
	} else {
		nvoxels2 = voxels;
		nvoxels = new VoxelMap();
	}
	var kernelDiff = [1, 0, -1];
	if (axis == "x") return korrelation1D(nvoxels2, kernelDiff, "x", nvoxels);
	if (axis == "y") return korrelation1D(nvoxels2, kernelDiff, "y", nvoxels);
	return korrelation1D(nvoxels2, kernelDiff, "z", nvoxels);
}

function normalizeGradients(voxels) {
	var nvoxels = new VoxelMap();
	var v = new THREE.Vector3();
	for (var e of voxels.entries()) {
		var voxel = e[1];
		var key = e[0];
		v.set(voxel.sx || 0, voxel.sy || 0, voxel.sz || 0)
		var length = v.length();
		if (length >= 0.001) {
			v.normalize();
			nvoxels.setByKey(key, { value: length, sx: v.x, sy: v.y, sz: v.z })
		}
	}
	return nvoxels;
}

function avgGradients(voxels) {
	var nvoxels = new VoxelMap();
	var avg = new THREE.Vector3();
	var v = new THREE.Vector3();
	for (var e of voxels.entries()) {
		var voxel = e[1];
		var key = e[0];
		var p = voxels.getPosition(key);
		var value = voxel.value;
		avg.set(voxel.sx || 0, voxel.sy || 0, voxel.sz || 0)
		var c = 1;

		for (var x = -1; x <= 1; x++) {
			for (var y = -1; y <= 1; y++) {
				for (var z = -1; z <= 1; z++) {
					if (x != 0 && y != 0 && z != 0) {
						var nv = voxels.get(p.x + x, p.y + y, p.z + z);
						if (nv) {
							v.set(nv.sx || 0, nv.sy || 0, nv.sz || 0);
							avg.add(v);
							value += nv.value;
							c++;
						}
					}
				}
			}
		}
		avg.divideScalar(c);
		avg.normalize();
		nvoxels.setByKey(key, { value: value / c, sx: avg.x, sy: avg.y, sz: avg.z })
	}
	return nvoxels;
}

function extendEdge(voxels) {
	var nvoxels = new VoxelMap();
	var todo = new Set();
	for (var [key, voxel] of voxels.entries()) {
		nvoxels.setByKey(key, voxel);
		var p = voxels.getPosition(key);

		for (var x = - 1; x <= 1; x++) {
			for (var y = - 1; y <= 1; y++) {
				for (var z = - 1; z <= 1; z++) {
					if (x == 0 && y == 0 && z == 0) continue;
					var k = voxels.getKey(p.x + x, p.y + y, p.z + z);
					if (!voxels.getByKey(k)) todo.add(k);
				}
			}
		}
	}
	function hasNeighbour(voxels, p, dir, u) {
		for (var s = 1; s <= u; s++) {
			if (voxels.get(p.x + dir.x * s, p.y + dir.y * s, p.z + dir.z * s)) return true;
		}
		return false;
	}
	var u = 3;
	for (var key of todo) {
		var p = voxels.getPosition(key);
		if (voxels.get(p.x - 1, p.y, p.z) && hasNeighbour(voxels, p, { x: 1, y: 0, z: 0 }, u)
			|| voxels.get(p.x, p.y - 1, p.z) && hasNeighbour(voxels, p, { x: 0, y: 1, z: 0 }, u)
			|| voxels.get(p.x, p.y, p.z - 1) && hasNeighbour(voxels, p, { x: 0, y: 0, z: 1 }, u)

			|| voxels.get(p.x - 1, p.y - 1, p.z - 1) && hasNeighbour(voxels, p, { x: 1, y: 1, z: 1 }, u)
			|| voxels.get(p.x + 1, p.y - 1, p.z - 1) && hasNeighbour(voxels, p, { x: -1, y: 1, z: 1 }, u)
			|| voxels.get(p.x - 1, p.y + 1, p.z - 1) && hasNeighbour(voxels, p, { x: 1, y: -1, z: 1 }, u)
			|| voxels.get(p.x - 1, p.y - 1, p.z + 1) && hasNeighbour(voxels, p, { x: 1, y: 1, z: -1 }, u)

		) {
			nvoxels.setByKey(key, { value: 10 });
		}

	}
	return nvoxels;
}

function removeMarked(voxels) {
	var nvoxels = new VoxelMap();
	for (var [key, voxel] of voxels.entries()) {
		if (!voxel.marked) nvoxels.setByKey(key, voxel)
	}
	return nvoxels;
}

function setAllValuesTo(voxels, value) {
	for (var [key, voxel] of voxels.entries()) {
		voxel.value = value;
	}
	return voxels;
}

function filter(filter = "") {
	setTimeout(() => {
		console.log("filter start")
		console.log(voxels.size());
		var nVoxels = voxels;
		if (filter == "gauss") {
			nVoxels = gauss3D(voxels);
			for (var [key, voxel] of nVoxels.entries()) {
				if (Math.abs(voxel.value) <= 0.001) nVoxels.removeByKey(key);
			}
		} else if (filter.startsWith("sobel")) {
			nVoxels = normalizeGradients(sobel3D(voxels, !filter.endsWith("noblur")));
		} else if (filter.startsWith("remove")) {
			nVoxels = removeMarked(voxels);
		} else if (filter.startsWith("makeallvaluessame")) {
			nVoxels = setAllValuesTo(voxels, 10);
		} else if (filter.startsWith("extendedges")) {
			nVoxels = extendEdge(voxels);
		} else if (filter.startsWith("avggradients")) {
			nVoxels = avgGradients(nVoxels);
		}
		console.log("filter done")
		console.log(nVoxels.size())
		voxels = nVoxels;
		loadScene();
	}, 0);
}

function toVoxels(file, rSize) {
	clean();
	console.log("read start")
	rasterSize = rSize;

	var min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
	var max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
	var vertexMatcher = /\s*v\s+([\-+]?\d+(?:\.\d+)?)\s+([\-+]?\d+(?:\.\d+)?)\s+([\-+]?\d+(?:\.\d+)?)/;
	readSomeLines(file, function (line) {
		var match = vertexMatcher.exec(line)
		if (match) {
			for (var i = 0; i < min.length; i++) {
				var v = parseFloat(match[i + 1]);
				min[i] = Math.min(min[i], v);
				max[i] = Math.max(max[i], v);
			}
		}
	}, function onComplete() {
		var dif = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
		var fac = (rasterSize - 1) / dif;
		var nvoxels = new VoxelMap();
		readSomeLines(file, function (line) {
			var match = vertexMatcher.exec(line)
			if (match) {
				var vertexArr = [];
				var vertexClamped = [];
				for (var i = 0; i < min.length; i++) {
					vertexArr[i] = (parseFloat(match[i + 1]) - min[i]) * fac;
					vertexClamped[i] = Math.floor(vertexArr[i]);
				}
				var vertex = { x: vertexArr[0], y: vertexArr[1], z: vertexArr[2] };
				var voxel = nvoxels.get(vertexClamped[0], vertexClamped[1], vertexClamped[2]);
				if (voxel) {
					voxel.value++;
					voxel.vertices.set(vertex.x, vertex.y, vertex.z, vertex);
				}
				else nvoxels.set(vertexClamped[0], vertexClamped[1], vertexClamped[2], { value: 10, vertices: new VoxelMap(vertex) });
			}
		}, function onComplete() {
			console.log('read done');
			setTimeout(() => {
				for (var [key, voxel] of nvoxels.entries()) {
					voxel.vertices = [...voxel.vertices.values()];
				}
				console.log(nvoxels.size());
				voxels = nvoxels;
				loadScene();
			}, 0);
		});
	});
}

document.getElementById('filterButton').onclick = function () {
	filter(document.getElementById('filter').value)
};

document.getElementById('loadButton').onclick = function () {
	var file = document.getElementById('infile').files[0];
	if (!file) {
		console.log('No file selected.');
		return;
	}
	toVoxels(file, document.getElementById('raster').value);
};

document.getElementById('colorType').onchange = function (evt) {
	colorType = evt.target.value;
	updateColors();
};

document.getElementById('clickType').onchange = function (evt) {
	clickType = evt.target.value;
};

document.getElementById('saveButton').onclick = function () {
	var text = "";
	for (var e of voxels.entries()) {
		var key = e[0];
		var v = e[1];
		var p = voxels.getPosition(key);
		text += "v " + p.x + " " + p.y + " " + p.z + "\n";
	}
	download("voxel.obj", text);
};

function readSomeLines(file, forEachLine, onComplete) {
	var CHUNK_SIZE = 20000; // 50kb, arbitrarily chosen.
	var offset = 0;
	var results = '';
	var fr = new FileReader();
	fr.onload = function () {
		// Use stream:true in case we cut the file
		// in the middle of a multi-byte character
		results += fr.result;
		var lines = results.split('\n');
		results = lines.pop(); // In case the line did not end yet.

		for (var i = 0; i < lines.length; ++i) {
			forEachLine(lines[i] + '\n');
		}
		offset += CHUNK_SIZE;
		seek();
	};
	fr.onerror = function () {
		onComplete(fr.error);
	};
	seek();

	function seek() {
		if (offset !== 0 && offset >= file.size) {
			// We did not find all lines, but there are no more lines.
			forEachLine(results); // This is from lines.pop(), before.
			onComplete(); // Done
			return;
		}
		var slice = file.slice(offset, offset + CHUNK_SIZE);
		fr.readAsText(slice);
	}
}

function download(filename, text) {
	var element = document.createElement('a');
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
	element.setAttribute('download', filename);

	element.style.display = 'none';
	document.body.appendChild(element);



	element.click();

	document.body.removeChild(element);
}

var PI2 = Math.PI * 2;

function FFT(f, inverse = false) {
	var dir = inverse ? -1 : 1;
	var out = _FFT(f, dir);
	if (dir == -1) {
		var N = out.length;
		for (var i = 0; i < N; i++) {
			out[i][0] /= N;
			out[i][1] /= N;
		}
	}
	return out;
}

function _FFT(f, dir) {
	var n = f.length;
	if (n == 1) return [[f[0][0], f[0][1]]];
	var nh = Math.floor(n / 2);
	var hf = [];
	for (var i = 0; i < nh; i++)
		hf[i] = f[2 * i];
	var g = _FFT(hf, dir);

	for (var i = 0; i < nh; i++)
		hf[i] = f[2 * i + 1];
	var u = _FFT(hf, dir);

	var c = [];
	for (var k = 0; k < n; k++) c[k] = [];
	for (var k = 0; k < nh; k++) {
		var a = -dir * k * PI2 / n;
		var cos = Math.cos(a);
		var sin = Math.sin(a);
		var mr = u[k][0] * cos - u[k][1] * sin;
		var mi = u[k][0] * sin + u[k][1] * cos;
		c[k][0] = g[k][0] + mr;
		c[k][1] = g[k][1] + mi;
		c[k + nh][0] = g[k][0] - mr;
		c[k + nh][1] = g[k][1] - mi;
	}
	if (n - nh > nh) c[n - 1] = [0, 0];
	return c;
}

function FFT3d(src, M, N, O, inverse = false) {
	function getValue(x, y, z, i) {
		if (!Array.isArray(src)) {
			if (i == 1) return 0;
			var v = src.get(x, y, z);
			if (v && v.value) return v.value;
			return 0;
		}
		if (!inverse && i == 1) return 0;
		var arr = src[x];
		if (!arr) return 0;
		var arr = arr[y];
		if (!arr) return 0;
		var arr = arr[z];
		if (Array.isArray(arr)) return arr[i];
		return arr || 0;
	}
	M = nextPowerOf2(M);
	N = nextPowerOf2(N);
	O = nextPowerOf2(O);
	var c = [];
	for (var x = 0; x < M; x++) {
		c[x] = [];
		for (var y = 0; y < N; y++) {
			c[x][y] = [];
			for (var z = 0; z < O; z++) {
				c[x][y][z] = [];
			}
		}
	}
	var rows = []; for (var i = 0; i < M; i++) rows[i] = [];
	for (var z = 0; z < O; z++) {
		for (var y = 0; y < N; y++) {
			for (var x = 0; x < M; x++) {
				rows[x][0] = getValue(x, y, z, 0);
				rows[x][1] = getValue(x, y, z, 1);
			}
			rows = FFT(rows, inverse);
			for (var x = 0; x < M; x++) {
				c[x][y][z][0] = rows[x][0];
				c[x][y][z][1] = rows[x][1];
			}
		}
	}
	var cols = []; for (var i = 0; i < N; i++) cols[i] = [];
	for (var x = 0; x < M; x++) {
		for (var z = 0; z < O; z++) {
			for (var y = 0; y < N; y++) {
				cols[y][0] = c[x][y][z][0];
				cols[y][1] = c[x][y][z][1];
			}
			cols = FFT(cols, inverse);
			for (var y = 0; y < N; y++) {
				c[x][y][z][0] = cols[y][0];
				c[x][y][z][1] = cols[y][1];
			}
		}
	}
	var depths = []; for (var i = 0; i < O; i++) depths[i] = [];
	for (var x = 0; x < M; x++) {
		for (var y = 0; y < N; y++) {
			for (var z = 0; z < O; z++) {
				depths[z][0] = c[x][y][z][0];
				depths[z][1] = c[x][y][z][1];
			}
			depths = FFT(depths, inverse);
			for (var z = 0; z < O; z++) {
				c[x][y][z][0] = depths[z][0];
				c[x][y][z][1] = depths[z][1];
			}
		}
	}
	return c;
}

function toAmplitude(f) {
	for (var x = 0; x < f.length; x++) {
		for (var y = 0; y < f[x].length; y++) {
			for (var z = 0; z < f[x][y].length; z++) {
				var real = f[x][y][z][0];
				var imag = f[x][y][z][1];
				f[x][y][z] = Math.sqrt(real * real + imag * imag);
			}
		}
	}
	return f;
}

function toLog(f) {
	for (var x = 0; x < f.length; x++) {
		for (var y = 0; y < f[x].length; y++) {
			for (var z = 0; z < f[x][y].length; z++) {
				f[x][y][z] = Math.log(1 + f[x][y][z]);
			}
		}
	}
	return f;
}

function nextPowerOf2(a) {
	var b = 1;
	while (b < a) b = b << 1;
	return b;
}

function count8Neighbour(f) {
	var marked = new VoxelMap();
	for (var key of f.keys()) {
		var p = f.getPosition(key);
		marked.setByKey(key, count8NeighbourAt(f, p.x, p.y, p.z));
	}
	return marked;
}

function count8NeighbourAt(f, x, y, z) {
	var n = 0;
	for (var nx = x - 1; nx <= x + 1; nx++) {
		for (var ny = y - 1; ny <= y + 1; ny++) {
			for (var nz = z - 1; nz <= z + 1; nz++) {
				var v = f.get(nx, ny, nz);
				if (v && v.value != 0) n++;
			}
		}
	}
	return n;
}

function floodFill(shouldBeMarked, p) {
	var marked = new VoxelMap();
	var stack = [];
	stack.push({ p: { x: p.x, y: p.y, z: p.z }, l: { x: p.x, y: p.y, z: p.z } });
	while (stack.length > 0) {
		var e = stack.pop();
		var p = e.p;
		if (!marked.get(p.x, p.y, p.z)) {
			var sbm = shouldBeMarked(e.p, e.l);
			if (sbm) {
				marked.set(p.x, p.y, p.z, true);
				for (var nx = p.x - 1; nx <= p.x + 1; nx++) {
					for (var ny = p.y - 1; ny <= p.y + 1; ny++) {
						for (var nz = p.z - 1; nz <= p.z + 1; nz++) {
							if (nx != p.x || ny != p.y || nz != p.z) {
								stack.push({ p: { x: nx, y: ny, z: nz }, l: { x: p.x, y: p.y, z: p.z } });
							}
						}
					}
				}
			}
		}
	}
	return marked;
}


function binarySearch(ar, el, compare_fn) {
	var m = 0;
	var n = ar.length - 1;
	while (m <= n) {
		var k = (n + m) >> 1;
		var cmp = compare_fn(el, ar[k]);
		if (cmp > 0) {
			m = k + 1;
		} else if (cmp < 0) {
			n = k - 1;
		} else {
			return k;
		}
	}
	return -m - 1;
}

function nextVoxel(p, d) {
	var vp = pointToVoxel(p);
	var difx = vp.x + Math.sign(d.x) / 2 - p.x;
	var dify = vp.y + Math.sign(d.y) / 2 - p.y;
	var difz = vp.z + Math.sign(d.z) / 2 - p.z;
	var min = Math.max(Math.min(difx / d.x, dify / d.y, difz / d.z), 0.06);
	return { position: { x: p.x + d.x * min, y: p.y + d.y * min, z: p.z + d.z * min }, t: min };
}

function raycast(getVoxel, p, d, min, max) {
	var r = intersectsRayAABB(p, d, min, max);
	if (!r) return false;

	var t = r.tmin < 0 ? 0 : r.tmin;

	var i = { x: p.x + t * d.x, y: p.y + t * d.y, z: p.z + t * d.z };


	// console.log("start")
	// var rayLine = new THREE.Geometry();
	// rayLine.vertices.push(new THREE.Vector3(i.x, i.y, i.z))
	// rayLine.vertices.push(new THREE.Vector3(i.x + d.x * 100, i.y + d.y * 100, i.z + d.z * 100))
	// scene.add(new THREE.Line(rayLine, new THREE.MeshBasicMaterial({ color: 0xffff00 })))

	// var wb = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
	// var m = new THREE.Mesh(wb, new THREE.MeshBasicMaterial(0xff0000));
	// var vp = pointToVoxel(i);
	// m.position.set(vp.x, vp.y, vp.z)
	// scene.add(new THREE.BoxHelper(m, 0xff0000));

	var pI = i;
	var maxIt = Math.abs(max.x - min.x) + Math.abs(max.y - min.y) + Math.abs(max.z - min.z);
	while (t <= r.tmax) {
		if (maxIt-- < 0) break;
		// m = new THREE.Mesh(wb, new THREE.MeshBasicMaterial(0x0000ff));
		// m.position.set(vp.x, vp.y, vp.z)
		// scene.add(new THREE.BoxHelper(m, 0x0000ff));

		var vp = pointToVoxel(pI);
		if (getVoxel(vp.x, vp.y, vp.z)) {
			return { position: vp };
		}
		var out = nextVoxel(pI, d);
		pI = out.position;
		t += out.t;
	}
	return false;

}


function intersectsRayAABB(p, d, min, max) {
	var tmin = (min.x - p.x) / d.x;
	var tmax = (max.x - p.x) / d.x;
	if (tmin > tmax) { var tmp = tmin; tmin = tmax; tmax = tmp; }

	var tymin = (min.y - p.y) / d.y;
	var tymax = (max.y - p.y) / d.y;
	if (tymin > tymax) { var tmp = tymin; tymin = tymax; tymax = tmp; }

	if ((tmin > tymax) || (tymin > tmax)) return false;
	if (tymin > tmin)
		tmin = tymin;
	if (tymax < tmax)
		tmax = tymax;

	var tzmin = (min.z - p.z) / d.z;
	var tzmax = (max.z - p.z) / d.z;
	if (tzmin > tzmax) { var tmp = tzmin; tzmin = tzmax; tzmax = tmp; }

	if ((tmin > tzmax) || (tzmin > tmax)) return false;

	if (tzmin > tmin)
		tmin = tzmin;
	if (tzmax < tmax)
		tmax = tzmax;

	return { tmin, tmax };
}




function updateHistogram(container) {
	var hist = new Array(256).fill(0);
	var histR = new Array(256).fill(0);
	var histG = new Array(256).fill(0);
	var histB = new Array(256).fill(0);
	for (var e of voxels.entries()) {
		var c = getColor(voxels.getPosition(e[0]), e[1]);
		hist[Math.floor((c.r + c.g + c.b) / 3)]++;
		histR[Math.floor(c.r)]++;
		histG[Math.floor(c.g)]++;
		histB[Math.floor(c.b)]++;
	}
	var max = 100 / Math.max(...hist);
	var maxR = 100 / Math.max(...histR);
	var maxG = 100 / Math.max(...histG);
	var maxB = 100 / Math.max(...histB);
	var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '100%');
	svg.setAttribute('height', '300px');
	svg.setAttribute('viewBox', '0 0 255 100');
	var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	g.setAttribute('transform', 'translate(0,100) scale(1,-1)');
	var polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
	polyline.setAttribute('points', hist.map((v, i) => i + "," + v * max).join(" "));
	polyline.setAttribute('style', 'fill:none;stroke:black;stroke-width:1');
	var polylineR = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
	polylineR.setAttribute('points', histR.map((v, i) => i + "," + v * maxR).join(" "));
	polylineR.setAttribute('style', 'fill:none;stroke:red;stroke-width:1');
	var polylineG = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
	polylineG.setAttribute('points', histG.map((v, i) => i + "," + v * maxG).join(" "));
	polylineG.setAttribute('style', 'fill:none;stroke:green;stroke-width:1');
	var polylineB = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
	polylineB.setAttribute('points', histB.map((v, i) => i + "," + v * maxB).join(" "));
	polylineB.setAttribute('style', 'fill:none;stroke:blue;stroke-width:1');
	g.appendChild(polyline);
	g.appendChild(polylineR);
	g.appendChild(polylineG);
	g.appendChild(polylineB);
	svg.appendChild(g);

	var div = document.createElement('div');
	div.setAttribute('style', 'display:flex;flex-direction:row');
	var cb = document.createElement('input');
	cb.setAttribute('type', 'checkbox');
	cb.checked = true;
	cb.addEventListener('click', ((e) => polyline.setAttribute('visibility', cb.checked ? 'visible' : 'hidden')));
	var cbR = document.createElement('input');
	cbR.setAttribute('type', 'checkbox');
	cbR.checked = true;
	cbR.addEventListener('click', ((e) => polylineR.setAttribute('visibility', cbR.checked ? 'visible' : 'hidden')));
	var cbG = document.createElement('input');
	cbG.setAttribute('type', 'checkbox');
	cbG.checked = true;
	cbG.addEventListener('click', ((e) => polylineG.setAttribute('visibility', cbG.checked ? 'visible' : 'hidden')));
	var cbB = document.createElement('input');
	cbB.setAttribute('type', 'checkbox');
	cbB.checked = true;
	cbB.addEventListener('click', ((e) => polylineB.setAttribute('visibility', cbB.checked ? 'visible' : 'hidden')));

	div.appendChild(document.createTextNode("Grey:"))
	div.appendChild(cb);
	div.appendChild(document.createTextNode("Red:"))
	div.appendChild(cbR);
	div.appendChild(document.createTextNode("Green:"))
	div.appendChild(cbG);
	div.appendChild(document.createTextNode("Blue:"))
	div.appendChild(cbB);

	while (container.firstChild) container.removeChild(container.firstChild);
	container.appendChild(svg);
	container.appendChild(div);
}