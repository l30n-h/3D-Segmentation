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
renderSurface.appendChild(renderer.domElement);

var needsRerendering = true;
var boxSize = 0.95;


function VoxelMap() {

	var voxel = new Map();

	this.get = (x, y, z) => {
		var v = voxel.get(hash(x, y, z));
		return v;
	}

	this.set = (x, y, z, v) => {
		voxel.set(hash(x, y, z), v);
	}

	this.remove = (key) => {
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

	function hash(x, y, z) {
		return x + "/" + y + "/" + z;
	}
}

function VertexGeometry() {

	var geometry = new THREE.Geometry();
	var geom = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
	var defaultMaterial = new THREE.MeshBasicMaterial({ vertexColors: THREE.FaceColors });
	var matrix = new THREE.Matrix4();
	var color = new THREE.Color();

	this.addCube = (position, hexColor) => {
		matrix.setPosition(position);
		applyVertexColors(geom, color.setHex(hexColor));
		geometry.merge(geom, matrix);
	}

	this.dispose = () => {
		geom.dispose();
		defaultMaterial.dispose();
		geom = null;
		defaultMaterial = null;
		matrix = null;
		color = null;
	}

	this.drawnObject = () => {
		return new THREE.Mesh(geometry, defaultMaterial);
	}

	function applyVertexColors(g, c) {
		g.faces.forEach((f) => {
			f.color = c;
			// var n = (f instanceof THREE.Face3) ? 3 : 4;
			// for (var j = 0; j < n; j++) {
			// 	f.vertexColors[j] = c;
			// }
		});
	}

}

var voxels = new VoxelMap();
var rasterSize;
var colorType = document.querySelector('input[name = "colorType"]:checked').value;
var positionOffset = { x: 0, y: 0, z: 0 };
var voxelsBounds = {
	min: { x: 0, y: 0, z: 0 },
	max: { x: 0, y: 0, z: 0 },
	valueMin: 0,
	valueMax: 0,
};

function getColor(p, voxel = null) {
	if (!voxel) voxel = voxels.get(x, y, z);
	var colorXYZ = colorType != "sum";
	var red = 0, green = 0, blue = 0;
	if (voxel.marked) blue = 255;
	else if (colorXYZ) {
		red = incContrast(p.x, voxelsBounds.min.x, voxelsBounds.max.x, 30, 225);
		green = incContrast(p.y, voxelsBounds.min.y, voxelsBounds.max.y, 30, 225);
		blue = incContrast(p.z, voxelsBounds.min.z, voxelsBounds.max.z, 30, 225);
	} else {
		var vc = incContrast(voxel.value, voxelsBounds.valueMin, voxelsBounds.valueMax, 30, 225);
		red = green = blue = vc;
	}
	return {
		r: red,
		g: green,
		b: blue,
		hex: (red << 16) + (green << 8) + blue
	}
}

function pointToVoxel(x, y, z) {
	var hbs = boxSize / 2;
	return {
		x: Math.floor(x + positionOffset.x + hbs),
		y: Math.floor(y + positionOffset.y + hbs),
		z: Math.floor(z + positionOffset.z + hbs)
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
		var intersects = raycaster.intersectObjects(scene.children);

		function setColor(mesh, index, color) {
			var fs = index * 12;
			var faces = mesh.geometry.faces;
			for (var f = 0; f < 12; f++) {
				var c = faces[fs + f].color;
				c.r = color.r / 255;
				c.g = color.g / 255;
				c.b = color.b / 255;
			}
			mesh.geometry.colorsNeedUpdate = true;
		}
		if (intersects.length > 0) {
			var p = intersects[0].point;
			var vp = pointToVoxel(p.x, p.y, p.z);
			var voxel = voxels.get(vp.x, vp.y, vp.z);
			if (voxel) {
				var index = voxel.index;
				if (!INTERSECTED || (INTERSECTED["object"] != intersects[0].object || INTERSECTED["index"] != voxel.index)) {
					if (INTERSECTED) setColor(INTERSECTED["object"], INTERSECTED["index"], INTERSECTED["color"]);
					INTERSECTED = {
						object: intersects[0].object,
						index: index,
						color: getColor(vp, voxel)
					};
					setColor(INTERSECTED["object"], INTERSECTED["index"], { r: 0, g: 255, b: 0 });
					console.log(vp)
				}
			} else {
				console.log(intersects)
			}
		} else {
			if (INTERSECTED) setColor(INTERSECTED["object"], INTERSECTED["index"], INTERSECTED["color"]);
			INTERSECTED = null;
		}
		if (doRaycast == "click") {
			if (intersects.length > 0) {
				setTimeout(() => {
					var p = intersects[0].point;
					var vp = pointToVoxel(p.x, p.y, p.z);
					var marked = floodFill(voxels, vp.x, vp.y, vp.z);
					for (var key of marked.keys()) {
						var p = marked.getPosition(key);
						voxels.get(p.x, p.y, p.z)["marked"] = true;
					}
					loadScene();
				}, 0);
			}
		}
		doRaycast = false;

		needsRerendering = true;
	}
	if (needsRerendering) {
		renderer.render(scene, camera);
		needsRerendering = false;
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
	voxelsBounds.valueMin = voxelsBounds.min.x = voxelsBounds.min.y = voxelsBounds.min.z = Number.POSITIVE_INFINITY;
	voxelsBounds.valueMax = voxelsBounds.max.x = voxelsBounds.max.y = voxelsBounds.max.z = Number.NEGATIVE_INFINITY;

	for (var e of voxels.entries()) {
		var key = e[0];
		var v = e[1].value;
		var p = voxels.getPosition(key);
		if (v > 0.001) {
			voxelsBounds.min.x = Math.min(voxelsBounds.min.x, p.x);
			voxelsBounds.min.y = Math.min(voxelsBounds.min.y, p.y);
			voxelsBounds.min.z = Math.min(voxelsBounds.min.z, p.z);
			voxelsBounds.max.x = Math.max(voxelsBounds.max.x, p.x);
			voxelsBounds.max.y = Math.max(voxelsBounds.max.y, p.y);
			voxelsBounds.max.z = Math.max(voxelsBounds.max.z, p.z);
			voxelsBounds.valueMin = Math.min(voxelsBounds.valueMin, v);
			voxelsBounds.valueMax = Math.max(voxelsBounds.valueMax, v);
		} else {
			voxels.remove(key)
		}
	}
	console.log(voxelsBounds);
	positionOffset.x = (voxelsBounds.max.x - voxelsBounds.min.x) / 2 + voxelsBounds.min.x;
	positionOffset.y = (voxelsBounds.max.y - voxelsBounds.min.y) / 2 + voxelsBounds.min.y;
	positionOffset.z = (voxelsBounds.max.z - voxelsBounds.min.z) / 2 + voxelsBounds.min.z;
}

function loadScene() {
	clearScene();
	calculateBounds();
	var vGeometry = new VertexGeometry();
	var position = new THREE.Vector3();
	var i = 0;
	for (var e of voxels.entries()) {
		var key = e[0];
		var value = e[1];
		var v = e[1].value;
		if (v > 0) {
			var p = voxels.getPosition(key);
			var color = getColor(p, value);

			position.set(p.x - positionOffset.x, p.y - positionOffset.y, p.z - positionOffset.z);
			vGeometry.addCube(position, color.hex);

			value["index"] = i;
			i++;
		}
	}
	scene.add(vGeometry.drawnObject());
	vGeometry.dispose();

	controls.userPanSpeed = 0.004 * new THREE.Vector3().subVectors(voxelsBounds.max, voxelsBounds.min).length()

	needsRerendering = true;
}

function incContrast(v, minV, maxV, min, max) {
	return Math.floor((minV == maxV ? 1 : ((v - minV) / (maxV - minV))) * (max - min) + min);
}

function gauss3DSeparated(voxels, size) {
	function getValue(voxels, x, y, z) {
		var v = voxels.get(x, y, z);
		if (!v || !v.value) return 0;
		return v.value;
	}

	var kernel = [1 / 4, 2 / 4, 1 / 4];
	var kh = Math.floor(kernel.length / 2);
	function gauss1D(voxels, out, axis) {
		var b = axis == "x" ? { x: 1, y: 0, z: 0 } : (axis == "y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 })
		for (var x = 0; x < size; x++) {
			for (var y = 0; y < size; y++) {
				for (var z = 0; z < size; z++) {
					var sum = 0;
					kernel.forEach((v, k) => {
						sum += getValue(voxels, x + (k-kh) * b.x, y + (k-kh) * b.y, z + (k-kh) * b.z) * v;
					});
					if (sum > 0) {
						var v = out.get(x, y, z);
						if (!v) {
							v = { value: 0 };
							out.set(x, y, z, v);
						}
						v.value = sum;
					}
				}
			}
		}
	}
	var nvoxels = new VoxelMap();
	var nvoxels2 = new VoxelMap();
	gauss1D(voxels, nvoxels, "x");
	gauss1D(nvoxels, nvoxels2, "y"); nvoxels.clear();
	gauss1D(nvoxels2, nvoxels, "z");
	return nvoxels;
}

function gauss3D(voxels, size) {
	function getValue(voxels, x, y, z) {
		var v = voxels.get(x, y, z);
		if (!v || !v.value) return 0;
		return v.value;
	}
	var nvoxels = new VoxelMap();
	var kernel = toTensor([1, 2, 1]);
	var kh = Math.floor(kernel.length / 2);
	for (var x = 0; x < size; x++) {
		for (var y = 0; y < size; y++) {
			for (var z = 0; z < size; z++) {
				var sum = 0;
				kernel.forEach((vx, kx) => {
					vx.forEach((vy, ky) => {
						vy.forEach((vz, kz) => {
							sum += getValue(voxels, x - kh + kx, y - kh + ky, z - kh + kz) * vz;
						});
					});
				});
				if (sum > 0) {
					var v = nvoxels.get(x, y, z);
					if (!v) {
						v = { value: 0 };
						nvoxels.set(x, y, z, v);
					}
					v.value = sum;
				}
			}
		}
	}
	return nvoxels;
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

function toVoxels(file, rSize, gauss) {
	clean();
	console.log("read start")
	rasterSize = rSize;

	var min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
	var max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
	var vertexMatcher = /\s*v\s+([\-+]?\d+(?:\.\d+))\s+([\-+]?\d+(?:\.\d+))\s+([\-+]?\d+(?:\.\d+))/;
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
		var nvoxels = new VoxelMap();
		var fac = (rasterSize - 1) / dif;
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
				else nvoxels.set(a[0], a[1], a[2], { value: 1 });
			}
		}, function onComplete() {
			console.log('read done');
			setTimeout(() => {
				//nvoxels = toLog(toAmplitude(FFT3d(nvoxels, rasterSize,rasterSize,rasterSize)));
				//nvoxels = toAmplitude(FFT3d(FFT3d(nvoxels, rasterSize,rasterSize,rasterSize),rasterSize,rasterSize,rasterSize, true));
				console.log(nvoxels.size());
				if (gauss) {
					console.log('gaussfilter start');
					var fvoxels = gauss3DSeparated(nvoxels, rasterSize);
					console.log(fvoxels.size())
					nvoxels.clear();
					for (var e of fvoxels.entries()) {
						var v = e[1].value;
						var p = fvoxels.getPosition(e[0]);
						if (v > 0.001) nvoxels.set(p.x, p.y, p.z, { value: v });
					}
					console.log('gaussfilter done');
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
	toVoxels(file, document.getElementById('raster').value, document.getElementById('gauss').checked);
};

document.getElementsByName('colorType').forEach((e) => {
	e.onclick = function () {
		colorType = e.value;
		loadScene();
	}
})

document.getElementById('save').onclick = function () {
	var text = "";
	for (var e of voxels.entries()) {
		var key = e[0];
		var v = e[1];
		var p = voxels.getPosition(key);
		if (v > 0.001) {
			text += "v " + x + " " + y + " " + z + "\n";
		}
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
		p = f.getPosition(key);
		marked.set(p.x, p.y, p.z, count8NeighbourAt(f, p.x, p.y, p.z));
	}
	return marked;
}

function count8NeighbourAt(f, x, y, z) {
	var n = 0;
	for (var nx = x - 1; nx <= x + 1; nx++) {
		for (var ny = y - 1; ny <= y + 1; ny++) {
			for (var nz = z - 1; nz <= z + 1; nz++) {
				var v = f.get(p.x, p.y, p.z);
				if (v && v.value > 0) n++;
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
		if (v && v.value > 0 && !marked.get(p.x, p.y, p.z)) {
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