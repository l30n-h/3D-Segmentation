var renderSurface = document.getElementById("renderSurface");
function getSurfaceWidth() {
	return renderSurface.offsetWidth;
}
function getSurfaceHeight() {
	return renderSurface.offsetHeight;
}
var renderer = new THREE.WebGLRenderer();
renderer.setSize(getSurfaceWidth(), getSurfaceHeight());
renderSurface.appendChild(renderer.domElement);

var controls;
var camera = new THREE.PerspectiveCamera(45, getSurfaceWidth() / getSurfaceHeight(), 0.1, 500);
var raycaster = new THREE.Raycaster();

var mousePos = new THREE.Vector2(), INTERSECTED;
var clickPos = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

var scene = new THREE.Scene();

var geometry = new THREE.BoxGeometry(1, 1, 1);
var materialGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
var materialRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
var cube;

var init = function () {
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.userPanSpeed = 0.02;
	camera.position.z = 5;

	var newScene = new THREE.Scene();
	var redX = 0;
	for (let x = 0; x < 5; x++) {
		var redY = 0;
		for (let y = 0; y < 5; y++) {
			var redZ = 0;
			for (let z = 0; z < 5; z++) {
				let c = new THREE.Mesh(geometry, redX + redY + redZ == 1 ? materialRed : materialGreen);
				c.position.set(x, y, z);
				newScene.add(c);

				redZ = (redZ + 1) % 2;
			}
			redY = (redY + 1) % 2;
		}
		redX = (redX + 1) % 2;
	}
	scene = newScene;
}

var resize = function () {
	camera.aspect = getSurfaceWidth() / getSurfaceHeight();
	camera.updateProjectionMatrix();
	renderer.setSize(getSurfaceWidth(), getSurfaceHeight());
}

var update = function () {
	controls.update();
}

var render = function () {
	raycaster.setFromCamera(mousePos, camera);
	var intersects = raycaster.intersectObjects(scene.children);
	if (intersects.length > 0) {
		if (INTERSECTED != intersects[0].object) {
			if (INTERSECTED) INTERSECTED.material.color.setHex(INTERSECTED.currentColor);
			INTERSECTED = intersects[0].object;
			INTERSECTED.currentColor = INTERSECTED.material.color.getHex();
			INTERSECTED.material.color.setHex(0x0000ff);
		}
	} else {
		if (INTERSECTED) INTERSECTED.material.color.setHex(INTERSECTED.currentColor);
		INTERSECTED = null;
	}
	if (Number.isFinite(clickPos.x)) {
		raycaster.setFromCamera(mousePos, camera);
		var intersects = raycaster.intersectObjects(scene.children);
		if (intersects.length > 0) {
			setTimeout(()=>{
				var p = intersects[0].object.arrayPosition;
				voxels = floodFill(voxels, p[0],p[1],p[2]);
				loadScene();
			},0);
		}
		clickPos.x=clickPos.y=Number.POSITIVE_INFINITY;
	}
	renderer.render(scene, camera);
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
	requestAnimationFrame(loopSimple);
	render();
	update();
}

init();
loopSimple();

renderSurface.addEventListener('mousemove', (event) => {
	mousePos.x = ((event.pageX - renderSurface.offsetLeft) / getSurfaceWidth()) * 2 - 1;
	mousePos.y = - ((event.pageY - renderSurface.offsetTop) / getSurfaceHeight()) * 2 + 1;
}, false);
renderSurface.addEventListener('click', (event) => {
	clickPos.x = ((event.pageX - renderSurface.offsetLeft) / getSurfaceWidth()) * 2 - 1;
	clickPos.y = - ((event.pageY - renderSurface.offsetTop) / getSurfaceHeight()) * 2 + 1;

}, false);
window.addEventListener('resize', resize, false);

var voxels = [];
var rasterSize;

function loadScene() {
	var newScene = new THREE.Scene();
	var materialMap = [];

	var minInVoxel = Number.POSITIVE_INFINITY;
	var maxInVoxel = Number.NEGATIVE_INFINITY;
	var voxelMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
	var voxelMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
	voxels.forEach((vx, x) => {
		if (vx) vx.forEach((vy, y) => {
			if (vy) vy.forEach((vz, z) => {
				if (vz > 0.001) {
					voxelMin[0] = Math.min(voxelMin[0], x);
					voxelMin[1] = Math.min(voxelMin[1], y);
					voxelMin[2] = Math.min(voxelMin[2], z);
					voxelMax[0] = Math.max(voxelMax[0], x);
					voxelMax[1] = Math.max(voxelMax[1], y);
					voxelMax[2] = Math.max(voxelMax[2], z);
					minInVoxel = Math.min(minInVoxel, vz);
					maxInVoxel = Math.max(maxInVoxel, vz);
				} else {
					voxels[x][y][z] = 0;
				}
			});
		});
	});
	console.log(minInVoxel);
	console.log(maxInVoxel);
	console.log(voxelMin);
	console.log(voxelMax);
	var ox = (voxelMax[0] - voxelMin[0]) / 2 + voxelMin[0];
	var oy = (voxelMax[1] - voxelMin[1]) / 2 + voxelMin[1];
	var oz = (voxelMax[2] - voxelMin[2]) / 2 + voxelMin[2];
	// var globalMesh = new THREE.Mesh();
	voxels.forEach((vx, x) => {
		var red = incContrast(x, voxelMin[0], voxelMax[0], 30, 225);
		if (vx) vx.forEach((vy, y) => {
			var green = incContrast(y, voxelMin[1], voxelMax[1], 30, 225);
			if (vy) vy.forEach((vz, z) => {
				var blue = incContrast(z, voxelMin[2], voxelMax[2], 30, 225);
				if (vz > 0) {
					//var color = (red << 16) + (green << 8) + blue;
					var color = incContrast(vz, minInVoxel, maxInVoxel, 50, 255)<<8;
					//var color = (vz>1?0xff0000:((red << 16) + (green << 8) + blue));
					if (!materialMap[color]) {
						materialMap[color] = new THREE.MeshBasicMaterial({ color: color });
					}
					let c = new THREE.Mesh(geometry, materialMap[color]);
					c["arrayPosition"] = [x,y,z];
					c.position.set(x - ox, y - oy, z - oz);
					newScene.add(c);
					// THREE.GeometryUtils.merge(globalMesh, c);
				}
			});
		});
	});
	// newScene.add(globalMesh);
	scene = newScene;
	controls.userPanSpeed = Math.max(maxInVoxel) * 0.004

}

function incContrast(v, minV, maxV, min, max) {
	return (minV==maxV?1:((v - minV) / (maxV - minV))) * (max - min) + min;
}

function clean() {
	voxels = [];
}

function gauss3D(voxels, size) {
	function getValue(voxels, x, y, z) {
		var arr = voxels[x];
		if (!arr) return 0;
		var arr = arr[y];
		if (!arr) return 0;
		return arr[z] || 0;
	}
	var nvoxels = [];
	var kernel = toTensor([1, 2, 1]);
	var kh = Math.floor(kernel.length / 2);
	for (var x = 0; x < size; x++) {
		nvoxels[x] = [];
		for (var y = 0; y < size; y++) {
			nvoxels[x][y] = [];
			for (var z = 0; z < size; z++) {
				var sum = 0;
				kernel.forEach((vx, kx) => {
					vx.forEach((vy, ky) => {
						vy.forEach((vz, kz) => {
							sum += getValue(voxels, x - kh + kx, y - kh + ky, z - kh + kz) * vz;
						});
					});
				});
				if (sum > 0) nvoxels[x][y][z] = sum;
			}
		}
	}
	return nvoxels;
}

function toTensor(kernel1D) {
	factor = kernel1D.reduce((pv, cv, arr) => pv + cv);
	factor = 1 / (factor * factor * factor);
	var out = [];
	for (x = 0; x < kernel1D.length; x++) {
		out[x] = [];
		for (y = 0; y < kernel1D.length; y++) {
			out[x][y] = [];
			for (z = 0; z < kernel1D.length; z++) {
				out[x][y][z] = kernel1D[x] * kernel1D[y] * kernel1D[z] * factor;
			}
		}
	}
	return out;
}

var toVoxels = function (file, rSize, gauss) {
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
		var nvoxels = [];
		for (var x = 0; x < rasterSize; x++) {
			nvoxels[x] = [];
			for (var y = 0; y < rasterSize; y++) {
				nvoxels[x][y] = [];
				for (var z = 0; z < rasterSize; z++) {
					nvoxels[x][y][z] = 0;
				}
			}
		}
		var fac = (rasterSize - 1) / dif;
		//var nvoxels = [];
		readSomeLines(file, function (line) {
			var match = vertexMatcher.exec(line)
			if (match) {
				var a = [];
				for (var i = 0; i < min.length; i++) {
					var v = parseFloat(match[i + 1]);
					a[i] = Math.floor((v - min[i]) * fac);
				}
				nvoxels[a[0]][a[1]][a[2]]++;
			}
		}, function onComplete() {
			console.log('read done');
			setTimeout(() => {
				//nvoxels = toLog(toAmplitude(FFT3d(nvoxels, rasterSize,rasterSize,rasterSize)));
				//nvoxels = toAmplitude(FFT3d(FFT3d(nvoxels, rasterSize,rasterSize,rasterSize),rasterSize,rasterSize,rasterSize, true));
				if (gauss) {
					console.log('gaussfilter start');
					nvoxels = gauss3D(nvoxels, rasterSize);
					console.log('gaussfilter done');
				}
				nvoxels = highlightEdges(nvoxels);
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

// document.getElementById('save').onclick = function () {
// 	var file = document.getElementById('outfile').files[0];
// 	if (!file) {
// 		console.log('No file selected.');
// 		return;
// 	}
// 	toVoxels(file, document.getElementById('raster').value, document.getElementById('gauss').checked);
// };


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
	function getValue(src, x, y, z, i) {
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
				rows[x][0] = getValue(src, x, y, z, 0);
				rows[x][1] = getValue(src, x, y, z, 1);
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

function highlightEdges(f) {
	var out = [];
	for (var x = 0; x < f.length; x++) {
		out[x] = [];
		for (var y = 0; y < f[x].length; y++) {
			out[x][y] = [];
			for (var z = 0; z < f[x][y].length; z++) {
				if (!f[x][y][z]) {
					out[x][y][z] = 0;
				}
				else out[x][y][z] = 27 - count8Neighbour(f, x, y, z);
			}
		}
	}
	return out;
}

function count8Neighbour(f, x, y, z) {
	var n = 0;
	for (var nx = x - 1; nx < x + 1; nx++) {
		for (var ny = y - 1; ny < y + 1; ny++) {
			for (var nz = z - 1; nz < z + 1; nz++) {
				if (f[nx] && f[nx][ny] && f[nx][ny][nz] > 0) {
					n++;
				}
			}
		}
	}
	return n;
}

function floodFill(f, x, y, z) {
	var out = []
	f.forEach((vx, x) => {
		out[x] = [];
		if (vx) vx.forEach((vy, y) => {
			out[x][y] = [];
			if (vy) vy.forEach((vz, z) => {
				if(vz>0)out[x][y][z] = 1;
			});
		});
	});
	_floodFill(f, out, x, y, z);
	return out;
}

function _floodFill(f, marked, x, y, z) {
	if (f[x] && f[x][y] && f[x][y][z] > 0 && marked[x][y][z] <= 1) {
		marked[x][y][z] = 10;
		for (var nx = x - 1; nx < x + 1; nx++) {
			for (var ny = y - 1; ny < y + 1; ny++) {
				for (var nz = z - 1; nz < z + 1; nz++) {
					_floodFill(f, marked, nx, ny, nz)
				}
			}
		}
	}
}