import CinematicLankBoss from './CinematicLankBoss'
import DialogSystem from './dialogSystem'
import { sleep } from './promiseThunks'
import { getThang } from '../../../core/api/thang-types'
import Loader from './Loader'
import { parseShot } from './ByteCode/ByteCodeParser'

const createjs = require('lib/createjs-parts')
const LayerAdapter = require('lib/surface/LayerAdapter')
const Camera = require('lib/surface/Camera')

const ThangType = require('models/ThangType')
const Lank = require('lib/surface/Lank')

/**
 * After processing should have a list of promises.
 *
 * Animations need to have a reference kept in case they need to
 * be moved to the end very quickly. Will need a system for
 * keeping track on animations by some generated id's. Once
 * animations complete can remove them from the store.
 *
 * We will need a converted from data -> promise thunks
 */
const hardcodedByteCodeExample = ({ cinematicLankBoss, dialogSystem }) => ([
  () => sleep(2000),
  () => Promise.race([sleep(0), cinematicLankBoss.moveLank('left', { x: -3 }, 2000)]),
  () => sleep(500),
  () => Promise.race([sleep(0), cinematicLankBoss.moveLank('right', { x: 3 }, 2000)]),
  () => sleep(500),
  () => dialogSystem.createBubble({
    htmlString: '<div>Want a high five!?</div>',
    x: 200,
    y: 200
  }),
  () => Promise.all([sleep(500), cinematicLankBoss.queueAction('left', 'attack')]),
  () => cinematicLankBoss.moveLank('right', { x: 10 }, 1000),
  () => dialogSystem.createBubble({
    htmlString: '<div>Oh no! My <b>sword</b> was attached!</div>',
    x: 200,
    y: 200
  }),
  () => cinematicLankBoss.moveLank('left', { x: -10 }, 10000)
])

/**
 * Takes a reference to a canvas and uses this to construct
 * the cinematic experience.
 * This controller loads a json file and plays cinematics.
 */
export class CinematicController {
  constructor ({ canvas, canvasDiv, slug }) {
    this.systems = {}
    this.systems.cinematicLankBoss = new CinematicLankBoss()

    this.stage = new createjs.StageGL(canvas)
    const camera = this.systems.camera = new Camera($(canvas))
    this.stubRequiredLayer = new LayerAdapter({ name: 'Ground', webGL: true, camera: camera })
    this.layerAdapter = new LayerAdapter({ name: 'Default', webGL: true, camera: camera })
    this.stage.addChild(this.layerAdapter.container)

    // Count the number of times we are making a new spritesheet
    let count = 0
    this.layerAdapter.on('new-spritesheet', (_spritesheet) => {
      // Now we have a working Anya that we can move around.
      // Potentially use this for loading behavior.
      // By counting how many times this is triggerred by ThangsTypes being loaded.
      console.log('Got a new spritesheet. Count:', ++count)
      // Only register the first time.
      // if (count === 1) this.stage.addEventListener('stagemousemove', this.moveHandler.bind(this))
    })

    this.systems.camera.zoomTo({ x: 0, y: 0 }, 7, 0)

    this.stageBounds = {
      topLeft: this.systems.camera.canvasToWorld({ x: 0, y: 0 }),
      bottomRight: this.systems.camera.canvasToWorld({ x: this.systems.camera.canvasWidth, y: this.systems.camera.canvasHeight })
    }

    this.systems.dialogSystem = new DialogSystem({ canvasDiv, camera })
    this.systems.loader = new Loader({ slug })

    this.startUp()
  }

  /**
   * Currently this function handles the asynchronous startup of the cinematic.
   * Hard coding some position starts.
   */
  async startUp () {
    const data = await this.systems.loader.loadAssets()

    return
    const commands = parseShot(data.shots[0], this.systems)
    console.log(commands)
    /**
     * Initialize an example Thang.
     */
    // https://codecombat.com/db/thang.type/cinematic-anya

    const thangTypes = ['cinematic-anya', 'narrative-speaker']
      .map(slug => ({ slug }))
      .map(getThang)
      .map(p => p.then(attributes => new ThangType(attributes)))

    const [anyaThang, narratorThang] = await Promise.all(thangTypes)

    const leftLank = await this.createLankFromThang({ thangType: anyaThang,
      thang: mockThang({
        pos: {
          x: this.stageBounds.topLeft.x - 2,
          y: this.stageBounds.bottomRight.y
        }
      })
    })
    const rightLank = await this.createLankFromThang({ thangType: narratorThang,
      thang: mockThang({
        rotation: Math.PI / 2,
        pos: {
          x: this.stageBounds.bottomRight.x + 2,
          y: this.stageBounds.bottomRight.y
        }
      })
    })

    this.systems.cinematicLankBoss.registerLank('left', leftLank)
    this.systems.cinematicLankBoss.registerLank('right', rightLank)

    this.initTicker()

    // Consume some hard coded pretend bytecode.
    const promiseThunks = hardcodedByteCodeExample({
      cinematicLankBoss: this.systems.cinematicLankBoss,
      dialogSystem: this.systems.dialogSystem
    })

    for (const thunk of promiseThunks) {
      await thunk()
    }
  }

  /**
   * Starts the render loop of the stage.
   */
  initTicker () {
    createjs.Ticker.framerate = 30
    const listener = {
      handleEvent: () => {
        this.systems.cinematicLankBoss.update(true)
        this.stage.update()
      }
    }
    createjs.Ticker.addEventListener('tick', listener)
  }

  /**
   * Creates a lank from a thangType and a thang.
   * The ThangType is the art and animation information.
   * The thang is like the instance of the ThangType.
   */
  createLankFromThang ({ thangType, thang }) {
    const lank = new Lank(thangType, {
      resolutionFactor: 60,
      preloadSounds: false,
      thang,
      camera: this.systems.camera,
      // This must be passed in as `new Mark` uses a groundLayer.
      // Without this nothing works. In this case I am using a dummy layer.
      // Cinematics doesn't require Marks
      groundLayer: this.stubRequiredLayer
    })

    this.layerAdapter.addLank(lank)

    return Promise.resolve(lank)
  }
}