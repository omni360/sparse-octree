import {
	flags,
	getFirstOctant,
	getNextOctant
} from "./raycasting";

import THREE from "three";

/**
 * A computation helper.
 *
 * @property v
 * @type Vector3
 * @private
 * @static
 * @final
 */

const v = new THREE.Vector3();

/**
 * An octant.
 *
 * @class Octant
 * @constructor
 * @param {Vector3} min - The lower bounds.
 * @param {Vector3} max - The upper bounds.
 * @param {Number} level - The depth level.
 */

export class Octant {

	constructor(min, max, level) {

		/**
		 * The lower bounds of this octant.
		 *
		 * @property min
		 * @type Vector3
		 * @final
		 */

		this.min = (min !== undefined) ? min: new THREE.Vector3();

		/**
		 * The upper bounds of the octant.
		 *
		 * @property max
		 * @type Vector3
		 * @final
		 */

		this.max = (max !== undefined) ? max: new THREE.Vector3();

		/**
		 * The depth level of this octant.
		 *
		 * @property level
		 * @type Number
		 * @final
		 */

		this.level = (level !== undefined) ? level: 0;

		/**
		 * The amount of points in this octant.
		 *
		 * @property totalPoints
		 * @type Number
		 */

		this.totalPoints = 0;

		/**
		 * The points that are inside this node.
		 *
		 * @property points
		 * @type Array
		 */

		this.points = null;

		/**
		 * Additional data that is kept in sets for individual points.
		 *
		 * @property dataSets
		 * @type Array
		 */

		this.dataSets = null;

		/**
		 * The children of this node.
		 *
		 * @property children
		 * @type Array
		 */

		this.children = null;

	}

	/**
	 * Computes the center of this octant.
	 *
	 * @method center
	 * @return {Vector3} The center of this octant.
	 */

	center() {

		return v.addVectors(this.min, this.max).multiplyScalar(0.5);

	}

	/**
	 * Computes the size of this octant.
	 *
	 * @method size
	 * @return {Vector3} The size of this octant.
	 */

	size() {

		return v.subVectors(this.max, this.min);

	}

	/**
	 * Computes the distance squared from the center of this octant to 
	 * the given point.
	 *
	 * @method distanceToCenterSquared
	 * @param {Vector3} p - A point.
	 * @return {Number} The distance squared.
	 */

	distanceToCenterSquared(p) {

		const center = this.center(); // @todo: cache this.

		const dx = p.x - center.x;
		const dy = p.y - center.x;
		const dz = p.z - center.z;

		return dx * dx + dy * dy + dz * dz;

	}

	/**
	 * Checks if the given point lies inside this octant's boundaries.
	 *
	 * @method containsPoint
	 * @param {Vector3} p - A point.
	 * @param {Number} bias - A padding that extends the boundaries temporarily.
	 * @return {Boolean} Whether the given point lies inside this octant.
	 */

	containsPoint(p, bias) {

		const min = this.min;
		const max = this.max;

		return (
			p.x >= min.x - bias &&
			p.y >= min.y - bias &&
			p.z >= min.z - bias &&
			p.x <= max.x + bias &&
			p.y <= max.y + bias &&
			p.z <= max.z + bias
		);

	}

	/**
	 * Adds a given point to this node. If this octant isn't a leaf node, 
	 * the point will be added to a child octant.
	 *
	 * @method add
	 * @param {Vector3} p - A point.
	 * @param {Object} [data] - An object that will be associated with the point.
	 * @return {Boolean} Whether the point was a unique addition.
	 */

	add(p, data) {

		let unique = false;
		let hit = false;

		let i, l;
		let points, point;
		let halfSize;

		if(this.children !== null) {

			unique = this.addToChild(p, data);

		} else {

			if(this.totalPoints === 0) {

				this.points = [];
				this.dataSets = [];

			}

			points = this.points;

			// @todo: improve time complexity of duplicate check.
			for(i = 0, l = this.totalPoints; !hit && i < l; ++i) {

				point = points[i];
				hit = (point[0] === p.x && point[1] === p.y && point[2] === p.z);

			}

			if(hit) {

				// Aggregate data of duplicates.
				if(data !== undefined) {

					this.dataSets[i - 1].add(data);

				}

			} else {

				unique = true;

				halfSize = this.size().multiplyScalar(0.5);

				if(this.totalPoints === Octant.maxPoints && this.level < Octant.maxDepth &&
					halfSize.x >= Octant.minSize.x && halfSize.y >= Octant.minSize.y && halfSize.z >= Octant.minSize.z) {

					// At maximum capacity and can still split.
					this.split();
					this.addToChild(p, data);

				} else {

					// Count distinct points in leaf nodes.
					this.totalPoints = this.points.push(p.toArray());
					this.dataSets.push(new Set());

					if(data !== undefined) {

						this.dataSets[this.totalPoints - 1].add(data);

					}

				}

			}

		}

		return unique;

	}

	/**
	 * Adds the given point to a child node that covers the point's position.
	 *
	 * @method addToChild
	 * @private
	 * @param {Vector3} p - A point.
	 * @param {Object} [data] - An object that will be associated with the point.
	 * @return {Boolean} Whether the point was a unique addition.
	 */

	addToChild(p, data) {

		let unique = false;
		let hit = false;

		let i, l;

		for(i = 0, l = this.children.length; !hit && i < l; ++i) {

			hit = this.children[i].containsPoint(p, Octant.bias);

			if(hit) {

				unique = this.children[i].add(p, data);

				if(unique) {

					// Register addition in parent node.
					++this.totalPoints;

				}

			}

		}

		return unique;

	}

	/**
	 * Splits this octant up into eight smaller ones.
	 *
	 * @method split
	 * @private
	 */

	split() {

		const p = new THREE.Vector3();

		const min = this.min;
		const mid = this.center().clone();
		const max = this.max;

		const nextLevel = this.level + 1;

		let i, l;
		let index, data;

		/* The order is important for raycasting.
		 *
		 *    3____7
		 *  2/___6/|
		 *  | 1__|_5
		 *  0/___4/
		 *
		 */

		this.children = [
			new Octant(min, mid, nextLevel),
			new Octant(new THREE.Vector3(min.x, min.y, mid.z), new THREE.Vector3(mid.x, mid.y, max.z), nextLevel),
			new Octant(new THREE.Vector3(min.x, mid.y, min.z), new THREE.Vector3(mid.x, max.y, mid.z), nextLevel),
			new Octant(new THREE.Vector3(min.x, mid.y, mid.z), new THREE.Vector3(mid.x, max.y, max.z), nextLevel),
			new Octant(new THREE.Vector3(mid.x, min.y, min.z), new THREE.Vector3(max.x, mid.y, mid.z), nextLevel),
			new Octant(new THREE.Vector3(mid.x, min.y, mid.z), new THREE.Vector3(max.x, mid.y, max.z), nextLevel),
			new Octant(new THREE.Vector3(mid.x, mid.y, min.z), new THREE.Vector3(max.x, max.y, mid.z), nextLevel),
			new Octant(mid, max, nextLevel)
		];

		// Distribute existing points to the new children.
		i = this.totalPoints - 1;
		this.totalPoints = 0;

		while(i >= 0) {

			p.fromArray(this.points[i]);

			if(this.dataSets[i].size > 0) {

				// Unfold data aggregations. Each entry is one point.
				for(data of this.dataSets[i].values()) {

					this.addToChild(p, data);

				}

			} else {

				this.addToChild(p);

			}

			--i;

		}

		this.points = null;
		this.dataSets = null;

	}

	/**
	 * Removes the given point from this octant. If this octant is not a leaf node, 
	 * the point will be removed from a child node. If no data is provided, the point 
	 * and all its respective data entries will be removed completely.
	 *
	 * @method remove
	 * @param {Vector3} p - The point.
	 * @param {Object} [data] - An object that is associated with the point.
	 * @return {Boolean} Whether the removed point was unique.
	 */

	remove(p, data) {

		const points = this.points;
		const dataSets = this.dataSets;

		let unique = false;

		let i, l;
		let point, last;

		let dataSet = null;

		if(this.children !== null) {

			unique = this.removeFromChild(p, data);

			if(this.totalPoints <= Octant.maxPoints) {

				this.merge();

			}

		} else if(this.totalPoints > 0) {

			for(i = 0, l = this.totalPoints; dataSet === null && i < l; ++i) {

				point = points[i];

				if(point[0] === p.x && point[1] === p.y && point[2] === p.z) {

					// Found it.
					dataSet = dataSets[i];

					if(data !== undefined) {

						dataSet.delete(data);

					} else {

						dataSet.clear();

					}

					if(dataSet.size === 0) {

						unique = true;
						last = l - 1;

						// If the point is NOT the last one in the array:
						if(i < last) {

							// Overwrite with the last point...
							points[i] = points[last];

							// ...and data set.
							dataSets[i] = dataSets[last];

						}

						// Drop the last entry.
						points.pop();
						dataSets.pop();

						// Register deletion in leaf node.
						--this.totalPoints;

					}

				}

			}

		}

		return unique;

	}

	/**
	 * Removes the given point from a child node.
	 *
	 * @method removeFromChild
	 * @private
	 * @param {Vector3} p - The point.
	 * @param {Object} [data] - An object that is associated with the point.
	 * @return {Boolean} Whether the removed point was unique.
	 */

	removeFromChild(p, data) {

		let unique = false;
		let hit = false;

		let i, l;

		for(i = 0, l = this.children.length; !hit && i < l; ++i) {

			hit = this.children[i].containsPoint(p, Octant.bias);

			if(hit) {

				unique = this.children[i].remove(p, data);

				if(unique) {

					// Register deletion in parent node.
					--this.totalPoints;

				}

			}

		}

		return unique;

	}

	/**
	 * Gathers all points from the children. The children are 
	 * expected to be leaf nodes and will be dropped afterwards.
	 *
	 * @method merge
	 * @private
	 */

	merge() {

		let i, j, il, jl;
		let child, id1, id2;

		this.totalPoints = 0;
		this.points = [];
		this.dataSets = [];

		for(i = 0, il = this.children.length; i < il; ++i) {

			child = this.children[i];

			for(j = 0, jl = child.totalPoints; j < jl; ++j) {

				this.totalPoints = this.points.push(child.points[j]);
				this.dataSets.push(child.dataSets[j]);

			}

		}

		this.children = null;

	}

	/**
	 * Refreshes this octant and its children to make sure that all 
	 * constraints are satisfied.
	 *
	 * @method update
	 */

	update() {

		const children = this.children;

		let i, l;
		let halfSize;

		if(children !== null) {

			// Start from the bottom.
			for(i = 0, l = children.length; i < l; ++i) {

				children[i].update();

			}

			halfSize = this.size().multiplyScalar(0.5);

			if(this.totalPoints <= Octant.maxPoints || this.level >= Octant.maxDepth ||
				halfSize.x < Octant.minSize.x || halfSize.y < Octant.minSize.y || halfSize.z < Octant.minSize.z) {

				// All points fit into one octant or the level is too high or the child octants are too small.
				this.merge();

			}

		} else if(this.totalPoints > Octant.maxPoints && this.level < Octant.maxDepth) {

			// Exceeding maximum capacity.
			this.split();

		}

	}

	/**
	 * Retrieves the data of the point at the specified position.
	 *
	 * @method fetch
	 * @param {Vector3} p - A position.
	 * @return {Set} A set of data entries that are associated with the given point or null if it doesn't exist.
	 */

	fetch(p) {

		let result = null;
		let hit = false;

		let i, l;

		if(this.containsPoint(p, Octant.bias)) {

			if(this.children !== null) {

				for(i = 0, l = this.children.length; result === null && i < l; ++i) {

					result = this.children[i].fetch(p);

				}

			} else {

				for(i = 0, l = this.totalPoints; !hit && i < l; ++i) {

					hit = (p.distanceToSquared(v.fromArray(this.points[i])) <= Octant.biasSquared);

					if(hit) {

						result = this.dataSets[i];

					}

				}

			}

		}

		return result;

	}

	/**
	 * Finds the closest point to the given one, excluding itself.
	 *
	 * @method findNearestPoint
	 * @param {Vector3} p - The point.
	 * @param {Number} maxDistance - The maximum distance.
	 * @param {Boolean} skipSelf - Whether a point that is exactly at the given position should be skipped.
	 * @return {Object} An object representing the nearest point or null if there is none. The object has a point and a data property.
	 */

	findNearestPoint(p, maxDistance, skipSelf) {

		const points = this.points;
		const children = this.children;

		let result = null;
		let bestDist = maxDistance;

		let i, l;
		let distSq;

		let sortedChildren;
		let child, childResult;

		// Only consider leaf nodes.
		if(children === null) {

			for(i = 0, l = this.totalPoints; i < l; ++i) {

				distSq = p.distanceToSquared(v.fromArray(points[i]));

				if((!skipSelf || distSq > 0.0) && distSq <= bestDist) {

					bestDist = distSq;

					result = {
						point: v.clone(),
						data: this.dataSets[i]
					};

				}

			}

		} else {

			// Sort the children.
			sortedChildren = children.map(function(child) {

				// Precompute distances.
				return {
					octant: child,
					distance: child.distanceToCenterSquared(p)
				};

			}).sort(function(a, b) {

				// Smallest distance to p first, ASC.
				return a.distance - b.distance;

			});

			// Traverse from closest to furthest.
			for(i = 0, l = sortedChildren.length; i < l; ++i) {

				// Unpack octant.
				child = sortedChildren[i].octant;

				if(child.totalPoints > 0 && child.containsPoint(p, bestDist)) {

					childResult = child.findNearestPoint(p, bestDist, skipSelf);

					if(childResult !== null) {

						distSq = childResult.point.distanceToSquared(p);

						if((!skipSelf || distSq > 0.0) && distSq <= bestDist) {

							bestDist = distSq;
							result = childResult;

						}

					}

				}

			}

		}

		return result;

	}

	/**
	 * Finds points that are inside the specified radius around a given position.
	 *
	 * @method findPoints
	 * @param {Vector3} p - A position.
	 * @param {Number} r - A radius.
	 * @param {Boolean} skipSelf - Whether a point that is exactly at the given position should be skipped.
	 * @param {Array} result - An array to be filled with objects, each containing a point and a data property.
	 */

	findPoints(p, r, skipSelf, result) {

		const points = this.points;
		const children = this.children;
		const rSq = r * r;

		let i, l;
		let distSq;
		let child;

		// Only consider leaf nodes.
		if(children === null) {

			for(i = 0, l = this.totalPoints; i < l; ++i) {

				distSq = p.distanceToSquared(v.fromArray(points[i]));

				if((!skipSelf || distSq > 0.0) && distSq <= rSq) {

					result.push({
						point: v.clone(),
						data: this.dataSets[i]
					});

				}

			}

		} else {

			// The order of the children is irrelevant.
			for(i = 0, l = children.length; i < l; ++i) {

				child = children[i];

				if(child.totalPoints > 0 && child.containsPoint(p, r)) {

					child.findPoints(p, r, skipSelf, result);

				}

			}

		}

	}

	/**
	 * Fetches all octants with the specified level.
	 *
	 * @method getOctantsByLevel
	 * @param {Number} level - The depth level.
	 * @param {Array} result - An array to be filled with octants. Empty octants will be excluded.
	 */

	getOctantsByLevel(level, result) {

		let i, l;

		if(this.level === level) {

			if(this.totalPoints > 0 || this.children !== null) {

				result.push(this);

			}

		} else if(this.children !== null) {

			for(i = 0, l = this.children.length; i < l; ++i) {

				this.children[i].getOctantsByLevel(level, result);

			}

		}

	}

	/**
	 * Finds the current tree depth recursively.
	 *
	 * @method getDepth
	 * @return {Number} The depth.
	 */

	getDepth() {

		let result = 0;
		let depth;
		let i, l;

		if(this.children !== null) {

			for(i = 0, l = this.children.length; i < l; ++i) {

				depth = 1 + this.children[i].getDepth();

				if(depth > result) {

					result = depth;

				}

			}

		}

		return result;

	}

	/**
	 * Finds all points that intersect with the given ray.
	 *
	 * @method raycast
	 * @param {Number} tx0 - Ray projection parameter. tx0 = (minX - rayOriginX) / rayDirectionX.
	 * @param {Number} ty0 - Ray projection parameter. ty0 = (minY - rayOriginY) / rayDirectionY.
	 * @param {Number} tz0 - Ray projection parameter. tz0 = (minZ - rayOriginZ) / rayDirectionZ.
	 * @param {Number} tx1 - Ray projection parameter. tx1 = (maxX - rayOriginX) / rayDirectionX.
	 * @param {Number} ty1 - Ray projection parameter. ty1 = (maxY - rayOriginY) / rayDirectionY.
	 * @param {Number} tz1 - Ray projection parameter. tz1 = (maxZ - rayOriginZ) / rayDirectionZ.
	 * @param {Raycaster} raycaster - The raycaster.
	 * @param {Array} intersects - An array to be filled with the intersecting points.
	 */

	raycast(tx0, ty0, tz0, tx1, ty1, tz1, raycaster, intersects) {

		const children = this.children;

		let currentOctant;
		let txm, tym, tzm;

		if(tx1 >= 0.0 && ty1 >= 0.0 && tz1 >= 0.0) {

			if(children === null) {

				// Leaf.
				if(this.totalPoints > 0) {

					intersects.push(this);

				}

			} else {

				// Compute means.
				txm = 0.5 * (tx0 + tx1);
				tym = 0.5 * (ty0 + ty1);
				tzm = 0.5 * (tz0 + tz1);

				currentOctant = getFirstOctant(tx0, ty0, tz0, txm, tym, tzm);

				do {

					/* The possibilities for the next node are passed in the same respective order as the t-values.
					 * Hence, if the first parameter is found as the greatest, the fourth one will be returned.
					 * If the 2nd parameter is the greatest, the 5th will be returned, etc.
					 */

					switch(currentOctant) {

						case 0:
							children[flags[8]].raycast(tx0, ty0, tz0, txm, tym, tzm, raycaster, intersects);
							currentOctant = getNextOctant(currentOctant, txm, tym, tzm);
							break;

						case 1:
							children[flags[8] ^ flags[1]].raycast(tx0, ty0, tzm, txm, tym, tz1, raycaster, intersects);
							currentOctant = getNextOctant(currentOctant, txm, tym, tz1);
							break;

						case 2:
							children[flags[8] ^ flags[2]].raycast(tx0, tym, tz0, txm, ty1, tzm, raycaster, intersects);
							currentOctant = getNextOctant(currentOctant, txm, ty1, tzm);
							break;

						case 3:
							children[flags[8] ^ flags[3]].raycast(tx0, tym, tzm, txm, ty1, tz1, raycaster, intersects);
							currentOctant = getNextOctant(currentOctant, txm, ty1, tz1);
							break;

						case 4:
							children[flags[8] ^ flags[4]].raycast(txm, ty0, tz0, tx1, tym, tzm, raycaster, intersects);
							currentOctant = getNextOctant(currentOctant, tx1, tym, tzm);
							break;

						case 5:
							children[flags[8] ^ flags[5]].raycast(txm, ty0, tzm, tx1, tym, tz1, raycaster, intersects);
							currentOctant = getNextOctant(currentOctant, tx1, tym, tz1);
							break;

						case 6:
							children[flags[8] ^ flags[6]].raycast(txm, tym, tz0, tx1, ty1, tzm, raycaster, intersects);
							currentOctant = getNextOctant(currentOctant, tx1, ty1, tzm);
							break;

						case 7:
							children[flags[8] ^ flags[7]].raycast(txm, tym, tzm, tx1, ty1, tz1, raycaster, intersects);
							// Far top right octant. No other octants can be reached from here.
							currentOctant = 8;
							break;

					}

				} while(currentOctant < 8);

			}

		}

	}

}

/**
 * A threshold for proximity checks.
 *
 * @property bias
 * @type Number
 * @static
 * @default 0.0
 */

Octant.bias = 0.0;

/**
 * The proximity threshold squared.
 *
 * @property biasSquared
 * @type Number
 * @static
 * @default 0.0
 */

Octant.biasSquared = 0.0;

/**
 * The maximum tree depth level.
 *
 * @property maxDepth
 * @type Number
 * @static
 * @default 8
 */

Octant.maxDepth = 8;

/**
 * Number of points per octant before a split occurs.
 *
 * @property maxPoints
 * @type Number
 * @static
 * @default 8
 */

Octant.maxPoints = 8;

/**
 * The minimum size of an octant.
 *
 * @property minSize
 * @type Vector3
 * @static
 * @default Vector3(1e-12, 1e-12, 1e-12)
 */

Octant.minSize = new THREE.Vector3(1e-12, 1e-12, 1e-12);
