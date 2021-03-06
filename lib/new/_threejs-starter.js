var scene = new THREE.Scene()
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 )

var renderer = new THREE.WebGLRenderer()
renderer.setSize( window.innerWidth, window.innerHeight )

document.body.insertBefore( renderer.domElement, document.body.firstChild )
// document.body.appendChild( renderer.domElement )

var geometry = new THREE.BoxGeometry( 1, 1, 1 )
var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } )
var cube = new THREE.Mesh( geometry, material )
scene.add( cube )

camera.position.z = 5

function render() {
    cube.rotation.x += 0.01
    cube.rotation.y += 0.01

    requestAnimationFrame( render )
    renderer.render( scene, camera )
}

function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );
}

window.addEventListener( 'resize', resize, false );

render()
