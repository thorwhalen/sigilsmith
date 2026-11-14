import trianglify from 'trianglify';
export default (key) => trianglify({ width: 64, height: 64, seed: key, cellSize: 24 }).toSVGTree().toString();
