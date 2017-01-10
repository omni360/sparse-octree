"use strict";

const lib = require("../build/sparse-octree");
const THREE = require("three");

const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));

module.exports = {

	"OctreeHelper": {

		"can be instantiated": function(test) {

			const helper = new lib.OctreeHelper();

			test.ok(helper, "octree helper");
			test.done();

		},

		"can be destroyed": function(test) {

			const octree = new lib.Octree(box.min, box.max);
			const helper = new lib.OctreeHelper(octree);

			helper.dispose();

			test.ok(helper, "octree helper");
			test.done();

		}

	}

};
