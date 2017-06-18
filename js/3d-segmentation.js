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
var boxSize = 0.95;


function VoxelMap() {

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
}

function VertexGeometry() {
	var cubes = true;
	var vboMap = new VoxelMap();

	var boxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
	boxGeo.faceVertexUvs = [[]]; var v = { x: 0, y: 0, z: 0 }
	boxGeo.faces.forEach(f => f.vertexNormals = [])

	var matrix = new THREE.Matrix4();

	this.add = (position) => {
		var p = getVBOPosition(position);
		var vbo = vboMap.get(p.x, p.y, p.z);
		if (!vbo) {
			vbo = { vertices: [], colors: [], geo: new THREE.BufferGeometry() };
			vbo.geo["isCube"] = cubes;
			vboMap.set(p.x, p.y, p.z, vbo);
		}
		var vboIndex = Math.floor(vbo.vertices.length / 3);
		if (cubes) vboIndex *= 8;
		vbo.vertices.push(position.x, position.y, position.z);
		vbo.colors.push(1, 0, 0);
		return { vbo: vbo.geo, vboIndex: vboIndex };
	}

	this.dispose = () => {
		boxGeo.dispose();
		boxGeo = null;
		matrix = null;
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
		var b = boxSize / 2;
		var vertices = new Float32Array(vbo.vertices.length * 8);
		for (var i = 0; i < vbo.vertices.length; i += 3) {
			var x = vbo.vertices[i];
			var y = vbo.vertices[i + 1];
			var z = vbo.vertices[i + 2];
			var i8 = i * 8;
			vertices[i8] = vertices[i8 + 3] = vertices[i8 + 6] = vertices[i8 + 9] = x - b;
			vertices[i8 + 1] = vertices[i8 + 4] = vertices[i8 + 13] = vertices[i8 + 16] = y - b;
			vertices[i8 + 2] = vertices[i8 + 8] = vertices[i8 + 14] = vertices[i8 + 20] = z - b;
			vertices[i8 + 12] = vertices[i8 + 15] = vertices[i8 + 18] = vertices[i8 + 21] = x + b;
			vertices[i8 + 7] = vertices[i8 + 10] = vertices[i8 + 19] = vertices[i8 + 22] = y + b;
			vertices[i8 + 5] = vertices[i8 + 11] = vertices[i8 + 17] = vertices[i8 + 23] = z + b;
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
	if (!voxel) voxel = voxels.get(x, y, z);
	var red = 0, green = 0, blue = 0;
	if (colorType == "xyz") {
		red = incContrast(p.x, voxelsBounds.min.x, voxelsBounds.max.x, 30, 225);
		green = incContrast(p.y, voxelsBounds.min.y, voxelsBounds.max.y, 30, 225);
		blue = incContrast(p.z, voxelsBounds.min.z, voxelsBounds.max.z, 30, 225);
	} else if (colorType == "value") {
		var vc = incContrast(voxel.value, voxelsBounds.min.value, voxelsBounds.max.value, 30, 225);
		red = green = blue = vc;
	} else if (colorType == "normal") {
		red = incContrast(voxel["sx"] || 0, voxelsBounds.min.sx, voxelsBounds.max.sx, 30, 225);
		green = incContrast(voxel["sy"] || 0, voxelsBounds.min.sy, voxelsBounds.max.sy, 30, 225);
		blue = incContrast(voxel["sz"] || 0, voxelsBounds.min.sz, voxelsBounds.max.sz, 30, 225);
	} else {
		var vc = Math.round(Math.floor(incContrast(voxel.value, voxelsBounds.min.value, voxelsBounds.max.value, 30, 225) / 19.5) * 19.5);
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
		if (cube.vbo.isCube) for (var c = 0; c < 8; c++) colors.setXYZ(cube.vboIndex + c, r, g, b);
		else colors.setXYZ(cube.vboIndex, r, g, b);
		colors.needsUpdate = true;
	}
}

function raycastClicked(position) {
	var vp = pointToVoxel(position);
	if (clickType == "floodfill") {
		setTimeout(() => {
			var marked = floodFill(voxels, vp.x, vp.y, vp.z);
			for (var key of marked.keys()) {
				voxels.getByKey(key)["marked"] = true;
			}
			updateColors();
		}, 0);
	} else {
		console.log(voxels.get(vp.x, vp.y, vp.z))
	}
}

function pointToVoxel(p) {
	var hbs = boxSize / 2;
	return {
		x: Math.floor(p.x + hbs),
		y: Math.floor(p.y + hbs),
		z: Math.floor(p.z + hbs)
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
			var vp = pointToVoxel({ x, y, z });
			return voxels.get(vp.x, vp.y, vp.z);
		}
		var hbs = boxSize / 2;
		var min = { x: voxelsBounds.min.x - hbs, y: voxelsBounds.min.y - hbs, z: voxelsBounds.min.z - hbs };
		var max = { x: voxelsBounds.max.x + hbs, y: voxelsBounds.max.y + hbs, z: voxelsBounds.max.z + hbs };
		var hit = traceRay(getVoxel, raycaster.ray.origin, raycaster.ray.direction, min, max, hit_position, hit_normal);
		if (hit) {
			var vp = pointToVoxel(hit.position);
			var voxel = voxels.get(vp.x, vp.y, vp.z);
			if (voxel) {
				if (!INTERSECTED || INTERSECTED["object"] != voxel.cube) {
					if (INTERSECTED) setColor(INTERSECTED["object"], getColor(INTERSECTED["vp"], INTERSECTED["object"]));
					INTERSECTED = {
						object: voxel.cube,
						vp: vp
					};
					setColor(voxel.cube, { r: 0, g: 255, b: 0 })
				}
			} else {
				console.log(hit)
			}
		} else {
			if (INTERSECTED) setColor(INTERSECTED["object"], getColor(INTERSECTED["vp"], INTERSECTED["object"]));
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
	timeDif = (time - _lastFrameTime);
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

renderSurface.addEventListener('mousemove', (event) => {
	setMousePosition(event, "move");
}, false);
renderSurface.addEventListener('click', (event) => {
	setMousePosition(event, "click");
}, false);

function setMousePosition(event, type) {
	if (event.ctrlKey) {
		if (doRaycast != "click") doRaycast = type;
		mousePos.x = ((event.pageX - renderSurface.offsetLeft) / getSurfaceWidth()) * 2 - 1;
		mousePos.y = - ((event.pageY - renderSurface.offsetTop) / getSurfaceHeight()) * 2 + 1;
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

	var vGeometry = new VertexGeometry();
	var i = 0;
	for (var e of voxels.entries()) {
		var voxel = e[1];
		var key = e[0];
		var p = voxels.getPosition(key);
		var cube = vGeometry.add(p);
		voxel["index"] = i;
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

function sobel3D(voxels) {
	var sx = sobel1D(voxels, "x");
	var sy = sobel1D(voxels, "y");
	var sz = sobel1D(voxels, "z");
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

function sobel1D(voxels, axis) {
	var kernelDiff = [1, 0, -1];
	var kernelBlur = [1, 2, 1];

	if (axis == "x") {
		var nvoxels = korrelation1D(voxels, kernelBlur, "z");
		var nvoxels2 = korrelation1D(nvoxels, kernelBlur, "y"); nvoxels.clear();
		return korrelation1D(nvoxels2, kernelDiff, "x", nvoxels);
	} else if (axis == "y") {
		var nvoxels = korrelation1D(voxels, kernelBlur, "x");
		var nvoxels2 = korrelation1D(nvoxels, kernelBlur, "z"); nvoxels.clear();
		return korrelation1D(nvoxels2, kernelDiff, "y", nvoxels);
	} else {
		var nvoxels = korrelation1D(voxels, kernelBlur, "y");
		var nvoxels2 = korrelation1D(nvoxels, kernelBlur, "x"); nvoxels.clear();
		return korrelation1D(nvoxels2, kernelDiff, "z", nvoxels);
	}
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

function extendEdge(voxels, size) {
	for (var e of voxels.entries()) {
		var p = voxels.getPosition(e[0]);
		var n200 = voxels.get(p.x - 2, p.y, p.z);
		var n100 = voxels.get(p.x - 1, p.y, p.z);
		var p200 = voxels.get(p.x + 2, p.y, p.z);
		var p100 = voxels.get(p.x + 1, p.y, p.z);

		var n020 = voxels.get(p.x, p.y - 2, p.z);
		var n010 = voxels.get(p.x, p.y - 1, p.z);
		var p020 = voxels.get(p.x, p.y + 2, p.z);
		var p010 = voxels.get(p.x, p.y + 1, p.z);

		var n002 = voxels.get(p.x, p.y, p.z - 2);
		var n001 = voxels.get(p.x, p.y, p.z - 1);
		var p002 = voxels.get(p.x, p.y, p.z + 2);
		var p001 = voxels.get(p.x, p.y, p.z + 1);

		var value = 30;

		if (n200 && !n100) {
			voxels.set(p.x - 1, p.y, p.z, { value: value });
		}
		if (p200 && !p100) {
			voxels.set(p.x + 1, p.y, p.z, { value: value });
		}

		if (n020 && !n010) {
			voxels.set(p.x, p.y - 1, p.z, { value: value });
		}
		if (p020 && !p010) {
			voxels.set(p.x, p.y + 1, p.z, { value: value });
		}

		if (n002 && !n001) {
			voxels.set(p.x, p.y, p.z - 1, { value: value });
		}
		if (p002 && !p001) {
			voxels.set(p.x, p.y, p.z + 1, { value: value });
		}
	}
	return voxels;
}

function toTensor(kernel1D) {
	var factor = kernel1D.reduce((pv, cv, arr) => pv + cv);
	factor = 1 / (factor * factor * factor);
	var out = [];
	for (var x = 0; x < kernel1D.length; x++) {
		out[x] = [];
		for (var y = 0; y < kernel1D.length; y++) {
			out[x][y] = [];
			for (var z = 0; z < kernel1D.length; z++) {
				out[x][y][z] = kernel1D[x] * kernel1D[y] * kernel1D[z] * factor;
			}
		}
	}
	return out;
}

function toVoxels(file, rSize, filter = "") {
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
				var a = [];
				for (var i = 0; i < min.length; i++) {
					var v = parseFloat(match[i + 1]);
					a[i] = Math.floor((v - min[i]) * fac);
				}
				var v = nvoxels.get(a[0], a[1], a[2]);
				if (v) v.value++;
				else nvoxels.set(a[0], a[1], a[2], { value: 10 });
			}
		}, function onComplete() {
			console.log('read done');
			setTimeout(() => {
				//nvoxels = toLog(toAmplitude(FFT3d(nvoxels, rasterSize,rasterSize,rasterSize)));
				//nvoxels = toAmplitude(FFT3d(FFT3d(nvoxels, rasterSize,rasterSize,rasterSize),rasterSize,rasterSize,rasterSize, true));
				console.log(nvoxels.size());
				if (filter == "gauss") {
					console.log('gauss start');
					var fvoxels = gauss3D(nvoxels);
					console.log(fvoxels.size())
					nvoxels.clear();
					for (var e of fvoxels.entries()) {
						var v = e[1].value;
						if (Math.abs(v) > 0.001) nvoxels.setByKey(e[0], { value: v });
					}
					console.log('gauss done');
				} else if (filter == "sobel") {
					console.log('sobel start');
					nvoxels = normalizeGradients(sobel3D(nvoxels));
					//nvoxels = avgGradients(nvoxels);
					console.log(nvoxels.size())
					console.log('sobel done');
				} else {
					//nvoxels = extendEdge(nvoxels, rasterSize);
				}
				voxels = nvoxels;
				loadScene();
			}, 0);
		});
	});
}


document.getElementById('start').onclick = function () {
	var file = document.getElementById('infile').files[0];
	if (!file) {
		console.log('No file selected.');
		return;
	}
	toVoxels(file, document.getElementById('raster').value, document.getElementById('filter').value);
};

document.getElementById('colorType').onchange = function (evt) {
	colorType = evt.target.value;
	updateColors();
};

document.getElementById('clickType').onchange = function (evt) {
	clickType = evt.target.value;
};

document.getElementById('save').onclick = function () {
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
	var decoder = new TextDecoder();
	var offset = 0;
	var results = '';
	var fr = new FileReader();
	fr.onload = function () {
		// Use stream:true in case we cut the file
		// in the middle of a multi-byte character
		results += decoder.decode(fr.result, { stream: true });
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
		fr.readAsArrayBuffer(slice);
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
				var v = f.get(p.x, p.y, p.z);
				if (v && v.value != 0) n++;
			}
		}
	}
	return n;
}

function floodFill(f, x, y, z) {
	var marked = new VoxelMap();
	var stack = [];
	stack.push({ x: x, y: y, z: z });
	while (stack.length > 0) {
		var p = stack.pop();
		var v = f.get(p.x, p.y, p.z);
		if (v && v.value != 0 && !marked.get(p.x, p.y, p.z)) {
			marked.set(p.x, p.y, p.z, true);
			for (var nx = p.x - 1; nx <= p.x + 1; nx++) {
				for (var ny = p.y - 1; ny <= p.y + 1; ny++) {
					for (var nz = p.z - 1; nz <= p.z + 1; nz++) {
						if (nx != p.x || ny != p.y || nz != p.z) {
							stack.push({ x: nx, y: ny, z: nz });
						}
					}
				}
			}
		}
	}
	return marked;
}


/*setTimeout(() => {
	console.log("start")
	var vm = new VoxelMap();
	vm.set(0,0,0,"a");
	vm.set(0,18,0,"b");
	vm.set(10,0,97,"c");
	vm.set(14,5,33,"d");
	console.log(vm.keys());
	for(var e of vm.entries()){
		console.log(e);
	}
	var co = 100;
	for (var x = 0; x < co; x++) {
		for (var y = 0; y < co; y++) {
			for (var z = 0; z < co; z++) {
				vm.get(x, y, z)
			}
		}
	}
	console.log("done")
}, 0);
*/
/*
var Octree = function (s) {
	var size = nextPowerOf2(s);

	var Node = function (p, s) {
		var size = s;
		var pivot = p+size/2;
		var data=null;
		var nodes;

		var get = (x,y,z) => {
			if(!nodes) return null;
			if(size<=1) return data;
			var index = getIndex(x,y,z);
			if(!nodes[index])return null;
			return nodes[index].get(x,y,z);
			
		}

		function getIndex(x,y,z){
			return ((x < pivot ? 0 : 1) + (y > pivot ? 0 : 4) + (z < pivot ? 0: 2));
		}
	}

	var root = new Node(0,size/2);


	var get = (x,y,z) => {
		if(isInBounds(x,y,z)){
			return root.get(x,y,z);
		}
		return undefined;
	}

	var isInBounds = (x,y,z) => {
		return x>=0 && x<size && y>=0 && y<size && z>=0 && z<size;
	}

	function nextPowerOf2(a) {
		var b = 1;
		while (b < a) b = b << 1;
		return b;
	}
}
*/


function traceRay_impl(getVoxel, p, d, min, max, hit_pos, hit_norm) {
	var r = intersectsRayAABB(p, d, min, max);
	if (!r) return false;

	var t = r.tmin <= 0 ? 0 : r.tmin;

	var i = { x: p.x + t * d.x, y: p.y + t * d.y, z: p.z + t * d.z };
	var step = { x: Math.sign(d.x) || -1, y: Math.sign(d.y) || -1, z: Math.sign(d.z) || -1 };

	var txDelta = Math.abs(1 / d.x);
	var tyDelta = Math.abs(1 / d.y);
	var tzDelta = Math.abs(1 / d.z);

	var xdist = (step.x > 0) ? (i.x + 1 - p.x) : (p.x - i.x);
	var ydist = (step.y > 0) ? (i.y + 1 - p.y) : (p.y - i.y);
	var zdist = (step.z > 0) ? (i.z + 1 - p.z) : (p.z - i.z);

	var txMax = (txDelta < Infinity) ? txDelta * xdist : Infinity;
	var tyMax = (tyDelta < Infinity) ? tyDelta * ydist : Infinity;
	var tzMax = (tzDelta < Infinity) ? tzDelta * zdist : Infinity;

	var steppedIndex = -1;

	while (t <= r.tmax) {
		var b = getVoxel(i.x, i.y, i.z)
		if (b) {
			return {
				position: { x: p.x + t * d.x, y: p.y + t * d.y, z: p.z + t * d.z },
				normal: { x: steppedIndex === 0 ? -step.x : 0, y: steppedIndex === 1 ? -step.y : 0, z: steppedIndex === 2 ? -step.z : 0 }
			};
		}
		if (txMax < tyMax) {
			if (txMax < tzMax) {
				i.x += step.x
				t = txMax
				txMax += txDelta
				steppedIndex = 0
			} else {
				i.z += step.z
				t = tzMax
				tzMax += tzDelta
				steppedIndex = 2
			}
		} else {
			if (tyMax < tzMax) {
				i.y += step.y
				t = tyMax
				tyMax += tyDelta
				steppedIndex = 1
			} else {
				i.z += step.z
				t = tzMax
				tzMax += tzDelta
				steppedIndex = 2
			}
		}

	}
	return false;

}

function traceRay(getVoxel, origin, direction, min, max, hit_pos, hit_norm) {
	var p = { x: origin.x, y: origin.y, z: origin.z };
	var d = { x: direction.x, y: direction.y, z: direction.z };
	var ds = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);

	if (ds === 0) {
		throw new Error("Can't raycast along a zero vector");
	}

	d.x /= ds;
	d.y /= ds;
	d.z /= ds;
	return traceRay_impl(getVoxel, p, d, min, max, hit_pos, hit_norm);
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

	if ((tmin > tzmax) || (tzmin > tmax))
		return false;
	if (tzmin > tmin)
		tmin = tzmin;
	if (tzmax < tmax)
		tmax = tzmax;

	return { tmin, tmax };
} 