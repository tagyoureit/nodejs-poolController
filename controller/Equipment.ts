import * as path from "path";
import * as fs from "fs";
import * as extend from "extend";
import {Protocol, Outbound, Response, Message} from "./comms/messages/Messages";
import {setTimeout} from "timers";
import {conn} from "./comms/Comms";
import {logger} from "../logger/Logger";
import {state, CircuitStateCollection, CommsState} from "./State";
import {Timestamp, ControllerType} from "./Constants";
export {ControllerType};
import {webApp} from "../web/Server";
import {SystemBoard} from "./boards/SystemBoard";
import {BoardFactory} from "./boards/BoardFactory";
import {EquipmentStateMessage} from "./comms/messages/status/EquipmentStateMessage";

interface IPoolSystem {
    cfgPath: string;
    data: any;
    stopAsync(): void;
    persist(): void;
    general: General;
    equipment: Equipment;
    configVersion: ConfigVersion;
    bodies: BodyCollection;
    schedules: ScheduleCollection;
    circuits: CircuitCollection;
    features: FeatureCollection;
    pumps: PumpCollection;
    chlorinators: ChlorinatorCollection;
    valves: ValveCollection;
    heaters: HeaterCollection;
    covers: CoverCollection;
    circuitGroups: CircuitGroupCollection;
    remotes: RemoteCollection;
    eggTimers: EggTimerCollection;
    security: Security;
    board: SystemBoard;
    updateControllerDateTime(
        hour: number,
        min: number,
        date: number,
        month: number,
        year: number,
        dst: number,
        dow?: number
    ): void;
}

export class PoolSystem implements IPoolSystem {
    constructor() {this.cfgPath = path.posix.join(process.cwd(), '/data/poolConfig.json');}
    public init() {
        //this.controllerType = PF.controllerType;
        let cfg = this.loadConfigFile(this.cfgPath, {});
        let cfgDefault = this.loadConfigFile(path.posix.join(process.cwd(), '/defaultPool.json'), {});
        cfg = extend(true, {}, cfgDefault, cfg);
        this.data = this.onchange(cfg, function() {sys.dirty = true;});
        this.general = new General(this.data, 'pool');
        this.equipment = new Equipment(this.data, 'equipment');
        this.configVersion = new ConfigVersion(this.data, 'configVersion');
        this.bodies = new BodyCollection(this.data, 'bodies');
        this.schedules = new ScheduleCollection(this.data, 'schedules');
        this.circuits = new CircuitCollection(this.data, 'circuits');
        this.features = new FeatureCollection(this.data, 'features');
        this.pumps = new PumpCollection(this.data, 'pumps');
        this.chlorinators = new ChlorinatorCollection(this.data, 'chlorinators');
        this.valves = new ValveCollection(this.data, 'valves');
        this.heaters = new HeaterCollection(this.data, 'heaters');
        this.covers = new CoverCollection(this.data, 'covers');
        this.circuitGroups = new CircuitGroupCollection(this.data, 'circuitGroups');
        this.lightGroups = new LightGroupCollection(this.data, 'lightGroups');
        this.remotes = new RemoteCollection(this.data, 'remotes');
        this.security = new Security(this.data, 'security');
        this.customNames = new CustomNameCollection(this.data, 'customNames');
        this.eggTimers = new EggTimerCollection(this.data, 'eggTimers');
        this.data.appVersion = this.appVersion = JSON.parse(fs.readFileSync(path.posix.join(process.cwd(), '/package.json'), 'utf8')).version;
        this.board = BoardFactory.fromControllerType(this.controllerType, this);
        this.intellibrite = new LightGroup(this.data, 'intellibrite', {id: 0, isActive: true, type: 3});
    }
    // This performs a safe load of the config file.  If the file gets corrupt or actually does not exist
    // it will not break the overall system and allow hardened recovery.
    public updateControllerDateTime(hour: number, min: number, date: number, month: number, year: number, dst: number, dow?: number) {}
    private loadConfigFile(path: string, def: any) {
        let cfg = def;
        if (fs.existsSync(path)) {
            try {
                cfg = JSON.parse(fs.readFileSync(path, 'utf8') || '{}');
            }
            catch (ex) {
                cfg = def;
            }
        }
        return cfg;
    }
    public processVersionChanges(ver: ConfigVersion) {this.board.requestConfiguration(ver);}
    public get controllerType(): ControllerType {return this.data.controllerType as ControllerType;}
    public set controllerType(val: ControllerType) {
        if (this.controllerType !== val) {
            // Only go in here if there is a change to the controller type.
            this.resetData(); // Clear the configuration data.
            state.resetData(); // Clear the state data.
            this.data.controllerType = val;
            EquipmentStateMessage.initDefaults();
            // We are actually changing the config so lets clear out all the data.
            this.board = BoardFactory.fromControllerType(val, this);
        }
    }
    public resetData() {
        this.circuitGroups.clear();
        this.lightGroups.clear();
        this.circuits.clear();
        this.bodies.clear();
        this.chlorinators.clear();
        this.configVersion.clear();
        this.covers.clear();
        this.customNames.clear();
        this.equipment.clear();
        this.features.clear();
        this.data.general = {};
        this.heaters.clear();
        this.pumps.clear();
        this.remotes.clear();
        this.schedules.clear();
        this.security.clear();
        this.valves.clear();
        this.covers.clear();

    }
    public stopAsync() {
        if (this._timerChanges) clearTimeout(this._timerChanges);
        if (this._timerDirty) clearTimeout(this._timerDirty);
        this.board.stopAsync();
    }
    public board: SystemBoard=new SystemBoard(this);
    public checkConfiguration() {this.board.checkConfiguration();}
    public cfgPath: string;
    public data: any;
    protected _lastUpdated: Date;
    protected _isDirty: boolean;
    protected _timerDirty: NodeJS.Timeout=null;
    protected _timerChanges: NodeJS.Timeout;
    protected _needsChanges: boolean;
    // All the equipment items below.
    public general: General;
    public equipment: Equipment;
    public configVersion: ConfigVersion;
    public bodies: BodyCollection;
    public schedules: ScheduleCollection;
    public eggTimers: EggTimerCollection;
    public circuits: CircuitCollection;
    public features: FeatureCollection;
    public pumps: PumpCollection;
    public chlorinators: ChlorinatorCollection;
    public valves: ValveCollection;
    public heaters: HeaterCollection;
    public covers: CoverCollection;
    public circuitGroups: CircuitGroupCollection;
    public lightGroups: LightGroupCollection;
    public remotes: RemoteCollection;
    public security: Security;
    public customNames: CustomNameCollection;
    public intellibrite: LightGroup;
    //public get intellibrite(): LightGroup { return this.lightGroups.getItemById(0, true, { id: 0, isActive: true, name: 'IntelliBrite', type: 3 }); } 
    public appVersion: string;
    public get dirty(): boolean {return this._isDirty;}
    public set dirty(val) {
        this._isDirty = val;
        this._lastUpdated = new Date();
        this.data.lastUpdated = this._lastUpdated.toLocaleString();
        if (this._timerDirty !== null) {
            clearTimeout(this._timerDirty);
            this._timerDirty = null;
        }
        if (this._isDirty) {
            this._timerDirty = setTimeout(() => this.persist(), 3000);
        }
    }
    public persist() {
        this._isDirty = false;
        // Don't overwrite the configuration if we failed during the initialization.
        if (typeof sys.circuits === 'undefined' || !this.circuits === null) {
            logger.info(`SKIPPING persist equipment because it is empty!`);
            return;
        }
        Promise.resolve()
            .then(() => {fs.writeFileSync(sys.cfgPath, JSON.stringify(sys.data, undefined, 2));})
            .catch(function(err) {if (err) logger.error('Error writing pool config %s %s', err, sys.cfgPath);});
        sys.emitEquipmentChange();
    }
    protected onchange=(obj, fn) => {
        const handler = {
            get(target, property, receiver) {
                const val = Reflect.get(target, property, receiver);
                if (typeof val === 'object' && val !== null) return new Proxy(val, handler);
                return val;
            },
            set(target, property, value, receiver) {
                if (property !== 'lastUpdated' && Reflect.get(target, property, receiver) !== value) {
                    fn();
                }
                return Reflect.set(target, property, value, receiver);
            },
            deleteProperty(target, property) {
                if (property in target) delete target[property];
                return true;
            }
        };
        return new Proxy(obj, handler);
    };
    public getSection(section?: string, opts?: any): any {
        if (typeof section === 'undefined' || section === 'all') return this.data;
        let c: any = this.data;
        if (section.indexOf('.') !== -1) {
            const arr = section.split('.');
            for (let i = 0; i < arr.length; i++) {
                if (typeof c[arr[i]] === 'undefined') {
                    c = null;
                    break;
                } else c = c[arr[i]];
            }
        } else c = c[section];
        return extend(true, {}, opts || {}, c || {});
    }
    public get equipmentState() {
        const self = this;
        return {
            lastUpdated: self._lastUpdated || 0,
            controllerType: self.data.controllerType || 'unknown',
            pool: self.data.pool || {},
            bodies: self.data.bodies || [],
            schedules: self.data.schedules || [],
            eggTimers: self.data.eggTimers || [],
            customNames: self.data.customNames || [],
            equipment: self.data.equipment || {},
            valves: self.data.valves || [],
            circuits: self.data.circuits || [],
            features: self.data.features || [],
            pumps: self.data.pumps || [],
            chlorinators: self.data.chlorinators || [],
            remotes: self.data.remotes || [],
            intellibrite: self.data.intellibrite || [],
            heaters: self.data.heaters || [],
            appVersion: self.data.appVersion || '0.0.0'
        };
    }
    public emitEquipmentChange() {this.emitData('config', this.equipmentState);}
    public emitData(name: string, data: any) {
        webApp.emitToClients(name, data);
    }

}
interface IEqItemCreator<T> {ctor(data: any, name: string): T;}
class EqItem implements IEqItemCreator<EqItem> {
    protected data: any;
    ctor(data, name?: string): EqItem {return new EqItem(data, name);}
    constructor(data, name?: string) {
        if (typeof name !== 'undefined') {
            if (typeof data[name] === 'undefined') data[name] = {};
            this.data = data[name];
        } else this.data = data;
    }
    public get(bCopy?: boolean): any {
        return bCopy ? extend(true, {}, this.data) : this.data;
    }
    public clear() {
        for (let prop in this.data) {
            if (Array.isArray(this.data[prop])) this.data[prop].length = 0;
            else this.data[prop] = undefined;
        }
    }
}
class EqItemCollection<T> {
    protected data: any;
    protected name: string;
    constructor(data: [], name: string) {
        if (typeof data[name] === "undefined") data[name] = [];
        this.data = data[name];
        this.name = name;
    }
    public getItemByIndex(ndx: number, add?: boolean, data?: any): T {
        return this.data.length > ndx ?
            this.createItem(this.data[ndx]) :
            typeof add !== 'undefined' && add ?
                this.add(this.createItem(data || {id: ndx + 1})) :
                this.createItem(data || {id: ndx + 1});
    }
    public getItemById(id: number, add?: boolean, data?: any): T {
        for (let i = 0; i < this.data.length; i++)
            if (typeof this.data[i].id !== 'undefined' && this.data[i].id === id) {
                return this.createItem(this.data[i]);
            }
        if (typeof add !== 'undefined' && add)
            return this.add(data || {id: id});
        return this.createItem(data || {id: id});
    }
    public removeItemById(id: number): T {
        let rem: T = null;
        for (let i = 0; i < this.data.length; i++)
            if (typeof this.data[i].id !== 'undefined' && this.data[i].id === id) {
                rem = this.data.splice(i, 1);
            }
        return rem;
    }
    public removeItemByIndex(ndx: number) {
        this.data.splice(ndx, 1);
    }
    public toArray() {
        let arr = [];
        if (typeof this.data !== 'undefined') {
            for (let i = 0; i < this.data.length; i++) {
                arr.push(this.createItem(this.data[i]));
            }
        }
        return arr;
    }
    public createItem(data: any): T {return (new EqItem(data) as unknown) as T;}
    public clear() {this.data.length = 0;}
    public get length(): number {return typeof this.data !== 'undefined' ? this.data.length : 0;}
    public set length(val: number) {if (typeof this.data !== 'undefined') this.data.length = val;}
    public add(obj: any): T {this.data.push(obj); return this.createItem(obj);}
    public get(): any {return this.data;}
    public emitEquipmentChange() {webApp.emitToClients(this.name, this.data);}
    public sortByName() {this.sort((a, b) => {return a.data.name > b.data.name ? 1 : -1;});}
    public sortById() {this.sort((a, b) => {return a.data.id > b.data.id ? 1 : -1;});}
    public sort(fn: (a, b) => number) {this.data.sort(fn);}
}
export class General extends EqItem {
    ctor(data): General {return new General(data, name || 'pool');}
    public get alias(): string {return this.data.alias;}
    public set alias(val: string) {this.data.alias = val;}
    public get owner(): Owner {return new Owner(this.data, 'owner');}
    public get options(): Options {return new Options(this.data, 'options');}
    public get location(): Location {return new Location(this.data, 'location');}
}
// Custom Names are IntelliTouch Only
export class CustomNameCollection extends EqItemCollection<CustomName> {
    constructor(data: any, name?: string) {super(data, name || "customNames");}
    public createItem(data: any): CustomName {return new CustomName(data);}
}
export class CustomName extends EqItem {
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
}

export class Owner extends EqItem {
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get phone(): string {return this.data.phone;}
    public set phone(val: string) {this.data.phone = val;}
    public get email(): string {return this.data.email;}
    public set email(val: string) {this.data.email = val;}
    public get email2(): string {return this.data.email2;}
    public set email2(val: string) {this.data.email2 = val;}
    public get phone2(): string {return this.data.phone2;}
    public set phone2(val: string) {this.data.phone2 = val;}
}
export class SensorCollection extends EqItemCollection<Sensor> {
    constructor(data: any, name?: string) {super(data, name || "sensors");}
    public createItem(data: any): Sensor {return new Sensor(data);}
}
export class Sensor extends EqItem {
    public get calibration(): number {return this.data.calibration;}
    public set calibration(val: number) {this.data.calibration = val;}
}
export class Options extends EqItem {
    public get clockMode(): number {return this.data.clockMode;}
    public set clockMode(val: number) {this.data.clockMode = val;}
    public get units(): string {return this.data.units;}
    public set units(val: string) {this.data.units = val;}
    public get clockSource(): string {return this.data.clockSource;}
    public set clockSource(val: string) {this.data.clockSource = val;}
    public get adjustDST(): boolean {return this.data.adjustDST;}
    public set adjustDST(val: boolean) {this.data.adjustDST = val;}
    public get manualPriority(): boolean {return this.data.manualPriority;}
    public set manualPriority(val: boolean) {this.data.manualPriority = val;}
    public get vacationMode(): boolean {return this.data.vacationMode;}
    public set vacationMode(val: boolean) {this.data.vacationMode = val;}
    public get manualHeat(): boolean {return this.data.manualHeat;}
    public set manualHeat(val: boolean) {this.data.manualHeat = val;}
    public get pumpDelay(): boolean {return this.pumpDelay;}
    public set pumpDelay(val: boolean) {this.data.pumpDelay = val;}
    public get cooldownDelay(): boolean {return this.data.cooldownDelay;}
    public set cooldownDelay(val: boolean) {this.data.cooldownDelay = val;}
    public get sensors(): SensorCollection {return new SensorCollection(this.data);}
    public get airTempAdj(): number {return typeof this.data.airTempAdj === 'undefined' ? 0 : this.data.airTempAdj;}
    public set airTempAdj(val: number) {this.data.airTempAdj = val;}
    public get waterTempAdj1(): number {return typeof this.data.waterTempAdj1 === 'undefined' ? 0 : this.data.waterTempAdj1;}
    public set waterTempAdj1(val: number) {this.data.waterTempAdj1 = val;}
    public get solarTempAdj1(): number {return typeof this.data.solarTempAdj1 === 'undefined' ? 0 : this.data.solarTempAdj1;}
    public set solarTempAdj1(val: number) {this.data.solarTempAdj1 = val;}
    public get waterTempAdj2(): number {return typeof this.data.waterTempAdj2 === 'undefined' ? 0 : this.data.waterTempAdj2;}
    public set waterTempAdj2(val: number) {this.data.waterTempAdj2 = val;}
    public get solarTempAdj2(): number {return typeof this.data.solarTempAdj2 === 'undefined' ? 0 : this.data.solarTempAdj2;}
    public set solarTempAdj2(val: number) {this.data.solarTempAd2 = val;}
}
export class Location extends EqItem {
    public get address(): string {return this.data.address;}
    public set address(val: string) {this.data.address = val;}
    public get city(): string {return this.data.city;}
    public set city(val: string) {this.data.city = val;}
    public get state(): string {return this.data.state;}
    public set state(val: string) {this.data.state = val;}
    public get zip(): string {return this.data.zip;}
    public set zip(val: string) {this.data.zip = val;}
    public get country(): string {return this.data.country;}
    public set country(val: string) {this.data.country = val;}
    public get latitude(): number {return this.data.latitude;}
    public set latitude(val: number) {this.data.latitude = val;}
    public get longitude(): number {return this.data.longitude;}
    public set longitude(val: number) {this.data.longitude = val;}
}
export class ExpansionPanelCollection extends EqItemCollection<ExpansionPanel> {
    constructor(data: any, name?: string) {super(data, name || "expansions");}
    public createItem(data: any): ExpansionPanel {return new ExpansionPanel(data);}
}
export class ExpansionPanel extends EqItem {
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
}
export class Equipment extends EqItem {
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get shared(): boolean {return this.data.shared;}
    public set shared(val: boolean) {this.data.shared = val;}
    public get maxBodies(): number {return this.data.maxBodies || 4;}
    public set maxBodies(val: number) {this.data.maxBodies = val;}
    public get maxValves(): number {return this.data.maxValves || 26;}
    public set maxValves(val: number) {this.data.maxValves = val;}
    public get maxPumps(): number {return this.data.maxPumps || 16;}
    public set maxPumps(val: number) {this.data.maxPumps = val;}
    public set maxSchedules(val: number) {this.data.maxSchedules = val;}
    public get maxSchedules(): number {return this.data.maxSchedules || 12;}
    public get maxCircuits(): number {return this.data.maxCircuits || 3;}
    public set maxCircuits(val: number) {this.data.maxCircuits = val;}
    public get maxFeatures(): number {return this.data.maxFeatures || 10;}
    public set maxFeatures(val: number) {this.data.maxFeatures = val;}
    public get maxRemotes(): number {return this.data.maxRemotes || 9;}
    public set maxRemotes(val: number) {this.data.maxRemotes = val;}
    public get maxCircuitGroups(): number {return this.data.maxCircuitGroups || 32;}
    public set maxCircuitGroups(val: number) {this.data.maxCircuitGroups = val;}
    public get maxLightGroups(): number {return this.data.maxLightGroups || 40;}
    public set maxLightGroups(val: number) {this.data.maxLightGroups = val;}
    public get maxChlorinators(): number {return this.data.maxChlorinators || 1;}
    public set maxChlorinators(val: number) {this.data.maxChlorinators = val;}
    public get maxHeaters(): number {return this.data.maxHeaters || 16;}
    public set maxHeaters(val: number) {this.data.maxHeaters = val;}
    public get model(): string {return this.data.model;}
    public set model(val: string) {this.data.model = val;}
    public get maxIntelliBrites(): number {return this.data.maxIntelliBrites;}
    public set maxIntelliBrites(val: number) {this.data.maxIntelliBrites = val;}
    public get expansions(): ExpansionPanelCollection {return new ExpansionPanelCollection(this.data, "expansions");}
    public get maxCustomNames(): number {return this.data.maxCustomNames || 10;}
    public set maxCustomNames(val: number) {this.data.maxCustomNames = val;}
    // Looking for IntelliCenter 1.029
    public set controllerFirmware(val: string) {this.data.softwareVersion = val;}
    public get controllerFirmware(): string {return this.data.softwareVersion;}
    public set bootloaderVersion(val: string) {this.data.bootloaderVersion = val;}
    public get bootloaderVersion(): string {return this.data.bootloaderVersion;}
    setEquipmentIds() {
        this.data.equipmentIds = {
            circuits: {start: sys.board.equipmentIds.circuits.start, end: sys.board.equipmentIds.circuits.end},
            features: {start: sys.board.equipmentIds.features.start, end: sys.board.equipmentIds.features.end},
            circuitGroups: {start: sys.board.equipmentIds.circuitGroups.start, end: sys.board.equipmentIds.circuitGroups.end},
            virtualCircuits: {start: sys.board.equipmentIds.virtualCircuits.start, end: sys.board.equipmentIds.virtualCircuits.end}
        };
    }
    public get equipmentIds(): any {
        return this.data.equipmentIds;
    }
}
export class IntelliTouchEquipment extends Equipment {}

export class ConfigVersion extends EqItem {
    constructor(data: any, name?: string) {
        super(data, name);
        if (typeof data.lastUpdated === 'undefined') this._lastUpdated = new Date();
        else this._lastUpdated = new Date(data.lastUpdated);
        if (isNaN(this._lastUpdated.getTime())) this._lastUpdated = new Date();
    }
    protected _lastUpdated: Date;
    public get lastUpdated(): Date {return this._lastUpdated;}
    public set lastUpdated(val: Date) {this._lastUpdated = val; this.data.lastUpdated = Timestamp.toISOLocal(val);}
    public get options(): number {return this.data.options;}
    public set options(val: number) {this.data.options = val;}
    public get circuits(): number {return this.data.circuits;}
    public set circuits(val: number) {this.data.circuits = val;}
    public get features(): number {return this.data.features;}
    public set features(val: number) {this.data.features = val;}
    public get pumps(): number {return this.data.pumps;}
    public set pumps(val: number) {this.data.pumps = val;}
    public get remotes(): number {return this.data.remotes;}
    public set remotes(val: number) {this.data.remotes = val;}
    public get circuitGroups(): number {return this.data.circuitGroups;}
    public set circuitGroups(val: number) {this.data.circuitGroups = val;}
    public get chlorinators(): number {return this.data.chlorinators;}
    public set chlorinators(val: number) {this.data.chlorinators = val;}
    public get intellichem(): number {return this.data.intellichem;}
    public set intellichem(val: number) {this.data.intellichem = val;}
    public get systemState(): number {return this.data.systemState;}
    public set systemState(val: number) {this.data.systemState = val;}
    public get valves(): number {return this.data.valves;}
    public set valves(val: number) {this.data.valves = val;}
    public get heaters(): number {return this.data.heaters;}
    public set heaters(val: number) {this.data.heaters = val;}
    public get security(): number {return this.data.security;}
    public set security(val: number) {this.data.security = val;}
    public get general(): number {return this.data.general;}
    public set general(val: number) {this.data.general = val;}
    public get equipment(): number {return this.data.equipment;}
    public set equipment(val: number) {this.data.equipment = val;}
    public get covers(): number {return this.data.covers;}
    public set covers(val: number) {this.data.covers = val;}
    public get schedules(): number {return this.data.schedules;}
    public set schedules(val: number) {this.data.schedules = val;}
    public hasChanges(ver: ConfigVersion) {
        // This will only check for items that are in the incoming ver data. This
        // is intentional so that only new versioned items will be detected.
        for (let prop in ver.data) {
            if (prop === 'lastUpdated') continue;
            if (ver.data[prop] !== this.data[prop]) {
                return true;
            }
        }
        return false;
    }
}
export class BodyCollection extends EqItemCollection<Body> {
    constructor(data: any, name?: string) {super(data, name || "bodies");}
    public createItem(data: any): Body {return new Body(data);}
    public setHeatMode(id: number, mode: number) {
        let body = this.getItemById(id);
        sys.board.bodies.setHeatMode(body, mode);
    }
    public setHeatSetpoint(id: number, setPoint: number) {
        let body = this.getItemById(id);
        sys.board.bodies.setHeatSetpoint(body, setPoint);
    }
}
export class Body extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = this.data.id;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get alias(): string {return this.data.alias;}
    public set alias(val: string) {this.data.alias = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get capacity(): number {return this.data.capacity;}
    public set capacity(val: number) {this.data.capacity = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get manualHeat(): boolean {return this.data.manualHeat;}
    public set manualHeat(val: boolean) {this.data.manualHeat = val;}
    public get setPoint(): number {return this.data.setPoint;}
    public set setPoint(val: number) {this.data.setPoint = val;}
    public get heatMode(): number {return this.data.heatMode;}
    public set heatMode(val: number) {this.data.heatMode = val;}
    public getHeatModes() {return sys.board.bodies.getHeatModes(this.id);}
    public setHeatMode(mode: number) {sys.board.bodies.setHeatMode(this, mode);}
    public setHeatSetpoint(setPoint: number) {sys.board.bodies.setHeatSetpoint(this, setPoint);}
}
export class ScheduleCollection extends EqItemCollection<Schedule> {
    constructor(data: any, name?: string) {super(data, name || "schedules");}
    public createItem(data: any): Schedule {return new Schedule(data);}
}
export class Schedule extends EqItem {
    constructor(data: any) {
        super(data);
        if (typeof data.startDate === 'undefined') this._startDate = new Date();
        else this._startDate = new Date(data.startDate);
        if (isNaN(this._startDate.getTime())) this._startDate = new Date();
    }
    private _startDate: Date=new Date();
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get startTime(): number {return this.data.startTime;}
    public set startTime(val: number) {this.data.startTime = val;}
    public get endTime(): number {return this.data.endTime;}
    public set endTime(val: number) {this.data.endTime = val;}
    public get scheduleDays(): number {return this.data.scheduleDays;}
    public set scheduleDays(val: number) {this.data.scheduleDays = val;}
    public get circuit(): number {return this.data.circuit;}
    public set circuit(val: number) {this.data.circuit = val;}
    public get heatSource(): number {return this.data.heatSource;}
    public set heatSource(val: number) {this.data.heatSource = val;}
    public get heatSetpoint(): number {return this.data.heatSetpoint;}
    public set heatSetpoint(val: number) {this.data.heatSetpoint = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get runOnce(): number {return this.data.runOnce;}
    public set runOnce(val: number) {this.data.runOnce = val;}
    public get startMonth(): number {return this._startDate.getMonth() + 1;}
    public set startMonth(val: number) {this._startDate.setMonth(val - 1); this._saveStartDate();}
    public get startDay(): number {return this._startDate.getDate();}
    public set startDay(val: number) {this._startDate.setDate(val); this._saveStartDate();}
    public get startYear(): number {return this._startDate.getFullYear();}
    public set startYear(val: number) {this._startDate.setFullYear(val < 100 ? val + 2000 : val); this._saveStartDate();}
    public get startDate(): Date {return this._startDate;}
    public set startDate(val: Date) {this._startDate = val;}
    private _saveStartDate() {this.startDate.setHours(0, 0, 0, 0); this.data.startDate = Timestamp.toISOLocal(this.startDate);}
    public get flags(): number {return this.data.flags;}
    public set flags(val: number) {this.data.flags = val;}
    public set(obj: any) {sys.board.schedules.setSchedule(this, obj);}
}
// TODO: Get rid of this
export class EggTimerCollection extends EqItemCollection<EggTimer> {
    constructor(data: any, name?: string) {super(data, name || "eggTimers");}
    public createItem(data: any): EggTimer {return new EggTimer(data);}
}
// TODO: Get rid of this
export class EggTimer extends EqItem {
    constructor(data: any) {
        super(data);
        if (typeof data.startDate === "undefined") this._startDate = new Date();
        else this._startDate = new Date(data.startDate);
        if (isNaN(this._startDate.getTime())) this._startDate = new Date();
    }
    private _startDate: Date=new Date();
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get runTime(): number {return this.data.runTime;}
    public set runTime(val: number) {this.data.runTime = val;}
    public get circuit(): number {return this.data.circuit;}
    public set circuit(val: number) {this.data.circuit = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
}
export class CircuitCollection extends EqItemCollection<Circuit> {
    constructor(data: any, name?: string) {super(data, name || "circuits");}
    public createItem(data: any): Circuit {return new Circuit(data);}
    public add(obj: any): Circuit {
        this.data.push(obj);
        let circuit = this.createItem(obj);
        if (typeof circuit.name === "undefined")
            circuit.name = Circuit.getIdName(circuit.id);
        return circuit;
    }
    public getInterfaceById(id: number, add?: boolean, data?: any): ICircuit {
        if (sys.board.equipmentIds.circuitGroups.isInRange(id))
            return sys.circuitGroups.getInterfaceById(id);
        else if (sys.board.equipmentIds.features.isInRange(id))
            return sys.features.getItemById(id, add, data);
        return sys.circuits.getItemById(id, add, data);
    }
}
export class Circuit extends EqItem implements ICircuit {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    // RG - remove this after I figure out what a macro means
    public get macro(): boolean {return this.data.macro;}
    public set macro(val: boolean) {this.data.macro = val;}
    // end remove
    public get freeze(): boolean {return this.data.freeze;}
    public set freeze(val: boolean) {this.data.freeze = val;}
    public get showInFeatures(): boolean {return this.data.showInFeatures;}
    public set showInFeatures(val: boolean) {this.data.showInFeatures = val;}
    public get showInCircuits(): boolean {return this.data.showInCircuits;}
    public set showInCircuits(val: boolean) {this.data.showInCircuits = val;}
    public get eggTimer(): number {return this.data.eggTimer;}
    public set eggTimer(val: number) {this.data.eggTimer = val;}
    public get lightingTheme(): number {return this.data.lightingTheme;}
    public set lightingTheme(val: number) {this.data.lightingTheme = val;}
    public get level(): number {return this.data.level;}
    public set level(val: number) {this.data.level = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public getLightThemes() {return sys.board.circuits.getLightThemes(this.type);}
    public static getIdName(id: number) {
        // todo: adjust for intellitouch
        let defName = "Aux" + (id + 1).toString();
        if (id === 0) defName = "Spa";
        else if (id === 5) defName = "Pool";
        else if (id < 5) defName = "Aux" + id.toString();
        return defName;
    }
}
export class FeatureCollection extends EqItemCollection<Feature> {
    constructor(data: any, name?: string) {super(data, name || "features");}
    public createItem(data: any): Feature {return new Feature(data);}
}
export class Feature extends EqItem implements ICircuit {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get freeze(): boolean {return this.data.freeze;}
    public set freeze(val: boolean) {this.data.freeze = val;}
    public get showInFeatures(): boolean {return this.data.showInFeatures;}
    public set showInFeatures(val: boolean) {this.data.showInFeatures = val;}
    public get eggTimer(): number {return this.data.eggTimer;}
    public set eggTimer(val: number) {this.data.eggTimer = val;}
    public get macro(): boolean {return this.data.macro;}
    public set macro(val: boolean) {this.data.macro = val;}
}
export interface ICircuitCollection {
    getItemById(id: number, add?: boolean, data?: any);
}
export interface ICircuit {
    id: number;
    name: string;
    type: number;
    eggTimer: number;
    freeze?: boolean;
    isActive: boolean;
    lightingTheme?: number;
    showInFeatures?: boolean;
    // RG - remove this after I figure out what macros are
    macro?: boolean;
    getLightThemes?: () => {}

}
export class PumpCollection extends EqItemCollection<Pump> {
    constructor(data: any, name?: string) {super(data, name || "pumps");}
    public createItem(data: any): Pump {return new Pump(data);}
    public getDualSpeed(add?: boolean): Pump {
        return this.getItemByIndex(0, add, {id: 0, type: 2, name: 'Two Speed'});
    }
}
export class Pump extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get minSpeed(): number {return this.data.minSpeed;}
    public set minSpeed(val: number) {this.data.minSpeed = val;}
    public get maxSpeed(): number {return this.data.maxSpeed;}
    public set maxSpeed(val: number) {this.data.maxSpeed = val;}
    public get primingSpeed(): number {return this.data.primingSpeed;}
    public set primingSpeed(val: number) {this.data.primingSpeed = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get flowStepSize(): number {return this.data.flowStepSize;}
    public set flowStepSize(val: number) {this.data.flowStepSize = val;}
    public get minFlow(): number {return this.data.minFlow;}
    public set minFlow(val: number) {this.data.minFlow = val;}
    public get maxFlow(): number {return this.data.maxFlow;}
    public set maxFlow(val: number) {this.data.maxFlow = val;}
    public get address(): number {return this.data.address;}
    public set address(val: number) {this.data.address = val;}
    public get primingTime(): number {return this.data.primingTime;}
    public set primingTime(val: number) {this.data.primingTime = val;}
    public get speedStepSize(): number {return this.data.speedStepSize;}
    public set speedStepSize(val: number) {this.data.speedStepSize = val;}
    public get turnovers() {return this.data.turnovers;}
    public set turnovers(val: number) {this.data.turnovers = val;}
    public get manualFilterGPM() {return this.data.manualFilterGPM;}
    public set manualFilterGPM(val: number) {this.data.manualFilterGPM = val;}
    public get maxSystemTime() {return this.data.maxSystemTime;}
    public set maxSystemTime(val: number) {this.data.maxSystemTime = val;}
    public get maxPressureIncrease() {return this.data.maxPressureIncrease;}
    public set maxPressureIncrease(val: number) {this.data.maxPressureIncrease = val;}
    public get backwashFlow() {return this.data.backwashFlow;}
    public set backwashFlow(val: number) {this.data.backwashFlow = val;}
    public get backwashTime() {return this.data.backwashTime;}
    public set backwashTime(val: number) {this.data.backwashTime = val;}
    public get rinseTime() {return this.data.rinseTime;}
    public set rinseTime(val: number) {this.data.rinseTime = val;}
    public get vacuumFlow() {return this.data.vacuumFlow;}
    public set vacuumFlow(val: number) {this.data.vacuumFlow = val;}
    public get vacuumTime() {return this.data.vacuumTime;}
    public set vacuumTime(val: number) {this.data.vacuumTime = val;}
    public get backgroundCircuit() {return this.data.backgroundCircuit;}
    public set backgroundCircuit(val: number) {this.data.backgroundCircuit = val;}
    // This is relevant only for single speed pumps attached to IntelliCenter.  All other pumps are driven from the circuits.  You cannot
    // identify a single speed pump in *Touch.
    public get body() {return this.data.body;}
    public set body(val: number) {this.data.body = val;}
    public get circuits(): PumpCircuitCollection {return new PumpCircuitCollection(this.data, "circuits");}
    public setPump(obj?: any) {sys.board.pumps.setPump(this, obj);}
    public setCircuitRate(circuitId: number, rate: number) {
        let c = this.circuits.getItemById(circuitId);
        if (c.units === 0) c.speed = rate;
        else c.flow = rate;
        this.setPump();
    }
    public setCircuitRateUnits(circuitId: number, units: number) {sys.board.pumps.setCircuitRateUnits(this, circuitId, units);}
    public setCircuitId(pumpCircuitId: number, circuitId: number) {sys.board.pumps.setCircuitId(this, pumpCircuitId, circuitId);}
    public setType(pumpType: number) {sys.board.pumps.setType(this, pumpType);}
}
export class PumpCircuitCollection extends EqItemCollection<PumpCircuit> {
    constructor(data: any, name?: string) {super(data, name || "circuits");}
    public createItem(data: any): PumpCircuit {return new PumpCircuit(data);}
}
export class PumpCircuit extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get circuit(): number {return this.data.circuit;}
    public set circuit(val: number) {this.data.circuit = val;}
    public get flow(): number {return this.data.flow;}
    public set flow(val: number) {this.data.flow = val;}
    public get speed(): number {return this.data.speed;}
    public set speed(val: number) {this.data.speed = val;}
    public get units(): number {return this.data.units;}
    public set units(val: number) {this.data.units = val;}
    // TODO: Figure out why this is here.
    public get body(): number {return this.data.body;}
    public set body(val: number) {this.data.body = val;}
}
export class ChlorinatorCollection extends EqItemCollection<Chlorinator> {
    constructor(data: any, name?: string) {super(data, name || "chlorinators");}
    public createItem(data: any): Chlorinator {return new Chlorinator(data);}
}
export class Chlorinator extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get body(): number {return this.data.body;}
    public set body(val: number) {this.data.body = val;}
    public get poolSetpoint(): number {return this.data.poolSetpoint;}
    public set poolSetpoint(val: number) {this.data.poolSetpoint = val;}
    public get spaSetpoint(): number {return this.data.spaSetpoint;}
    public set spaSetpoint(val: number) {this.data.spaSetpoint = val;}
    public get superChlorHours(): number {return this.data.superChlorHours;}
    public set superChlorHours(val: number) {this.data.superChlorHours = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get address(): number {return this.data.address;}
    public set address(val: number) {this.data.address = val;}
    public get superChlor(): boolean {return this.data.superChlor;}
    public set superChlor(val: boolean) {this.data.superChlor = val;}
    public set name(val: string) {this.data.name = val;}
    public get name(): string {return this.data.name;}
}
export class ValveCollection extends EqItemCollection<Valve> {
    constructor(data: any, name?: string) {super(data, name || "valves");}
    public createItem(data: any): Valve {return new Valve(data);}
}
export class Valve extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get circuit(): number {return this.data.circuit;}
    public set circuit(val: number) {this.data.circuit = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
}
export class HeaterCollection extends EqItemCollection<Heater> {
    constructor(data: any, name?: string) {super(data, name || "heaters");}
    public createItem(data: any): Heater {return new Heater(data);}
}
export class Heater extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get body(): number {return this.data.body;}
    public set body(val: number) {this.data.body = val;}
    public get maxBoostTemp(): number {return this.data.maxBoostTemp;}
    public set maxBoostTemp(val: number) {this.data.maxBoostTemp = val;}
    public get startTempDelta(): number {return this.data.startTempDelta;}
    public set startTempDelta(val: number) {this.data.startTempDelta = val;}
    public get stopTempDelta(): number {return this.data.stopTempDelta;}
    public set stopTempDelta(val: number) {this.data.stopTempDelta = val;}
    public get address(): number {return this.data.address;}
    public set address(val: number) {this.data.address = val;}
    public get efficiencyMode(): number {return this.data.efficiencyMode;}
    public set efficiencyMode(val: number) {this.data.efficiencyMode = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get coolingEnabled(): boolean {return this.data.coolingEnabled;}
    public set coolingEnabled(val: boolean) {this.data.coolingEnabled = val;}
    public get heatingEnabled(): boolean {return this.data.heatingEnabled;}
    public set heatingEnabled(val: boolean) {this.data.heatingEnabled = val;}
    public get differentialTemp(): number {return this.data.differentialTemp;}
    public set differentialTemp(val: number) {this.data.differentialTemp = val;}
    public get freeze(): boolean {return this.data.freeze;}
    public set freeze(val: boolean) {this.data.freeze = val;}
    public get economyTime(): number {return this.data.economyTime;}
    public set economyTime(val: number) {this.data.economyTime = val;}

}
export class CoverCollection extends EqItemCollection<Cover> {
    constructor(data: any, name?: string) {super(data, name || "covers");}
    public createItem(data: any): Cover {
        if (typeof data.circuits === 'undefined') data.circuits = [];
        return new Cover(data);
    }
}
export class Cover extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get body(): number {return this.data.body;}
    public set body(val: number) {this.data.body = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get normallyOn(): boolean {return this.data.normallyOn;}
    public set normallyOn(val: boolean) {this.data.normallyOn = val;}
    public get circuits(): number[] {return this.data.circuits;}
    public set circuits(val: number[]) {this.data.circuits = val;}
}
export interface ICircuitGroup {
    id: number;
    type: number;
    name: string;
    eggTimer: number;
    isActive: boolean;
    lightingTheme?: number;
    circuits: LightGroupCircuitCollection|CircuitGroupCircuitCollection;
}
export class LightGroupCollection extends EqItemCollection<LightGroup> {
    constructor(data: any, name?: string) {super(data, name || "lightGroups");}
    public createItem(data: any): LightGroup {return new LightGroup(data);}
}
export class LightGroupCircuitCollection extends EqItemCollection<LightGroupCircuit> {
    constructor(data: any, name?: string) {super(data, name || 'circuits');}
    public createItem(data: any): LightGroupCircuit {return new LightGroupCircuit(data);}
    public getItemByCircuitId(circuitId: number, add?: boolean, data?: any) {
        for (let i = 0; i < this.data.length; i++)
            if (typeof this.data[i].circuit !== 'undefined' && this.data[i].circuit === circuitId) {
                return this.createItem(this.data[i]);
            }
        if (typeof add !== 'undefined' && add)
            return this.add(data || {id: this.data.length + 1, circuit: circuitId, position: this.data.length, color: 0, swimDelay: 1});
        return this.createItem(data || {id: this.data.length + 1, circuit: circuitId, position: this.data.length, color: 0, swimDelay: 1});
    }
    public removeItemByCircuitId(id: number): LightGroupCircuit {
        let rem: LightGroupCircuit = null;
        for (let i = 0; i < this.data.length; i++)
            if (typeof this.data[i].circuit !== 'undefined' && this.data[i].circuit === id) {
                rem = this.data.splice(i, 1);
            }
        return rem;
    }
    public sortByPosition() {sys.intellibrite.circuits.sort((a, b) => {return a.position > b.position ? 1 : -1;});}
}
export class LightGroupCircuit extends EqItem {
    public get circuit(): number {return this.data.circuit;}
    public set circuit(val: number) {this.data.circuit = val;}
    // RG - these shouldn't be here; only need them for CircuitGroupCircuit but if I remove it getItemById returns an error... to be fixed.
    public get desiredStateOn(): boolean {return this.data.desiredStateOn;}
    public set desiredStateOn(val: boolean) {this.data.desiredStateOn = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get lightingTheme(): number {return this.data.lightingTheme;}
    public set lightingTheme(val: number) {this.data.lightingTheme = val;}
    public get position(): number {return this.data.position;}
    public set position(val: number) {this.data.position = val;}
    public get color(): number {return this.data.color;}
    public set color(val: number) {this.data.color = val;}
    public get swimDelay(): number {return this.data.swimDelay;}
    public set swimDelay(val: number) {this.data.swimDelay = val;}
    public getExtended() {
        let circ = this.get(true);
        circ.circuit = state.circuits.getInterfaceById(this.circuit).get(true);
        circ.lightingTheme = undefined;
        circ.swimDelay = this.swimDelay;
        circ.position = this.position;
        circ.color = sys.board.valueMaps.lightColors.transform(this.color);
        return circ;
    }
}
export class LightGroup extends EqItem implements ICircuitGroup, ICircuit {
    constructor(data, name?: string, obj?: any) {
        super(data, name);
        if (typeof obj !== 'undefined') extend(true, this.data, obj);
    }
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get eggTimer(): number {return this.data.eggTimer;}
    public set eggTimer(val: number) {this.data.eggTimer = val;}
    public get lightingTheme(): number {return this.data.lightingTheme;}
    public set lightingTheme(val: number) {this.data.lightingTheme = val;}
    public get circuits(): LightGroupCircuitCollection {return new LightGroupCircuitCollection(this.data, "circuits");}
    public setGroupState(val: boolean) {sys.board.features.setGroupState(this, val);}
    public getLightThemes() {return sys.board.valueMaps.lightThemes.toArray();}
    public getExtended() {
        let group = this.get(true);
        group.type = sys.board.valueMaps.circuitGroupTypes.transform(group.type);
        group.lightingTheme = sys.board.valueMaps.lightThemes.transform(group.lightingTheme || 0);
        let gstate = this.id !== 0 ? state.lightGroups.getItemById(this.id).getExtended() : state.intellibrite.getExtended();
        group.action = gstate.action;
        group.isOn = gstate.isOn;
        group.circuits = [];
        for (let i = 0; i < this.circuits.length; i++) {
            group.circuits.push(this.circuits.getItemByIndex(i).getExtended());
        }
        return group;
    }
}

export class CircuitGroupCircuitCollection extends EqItemCollection<CircuitGroupCircuit> {
    constructor(data: any, name?: string) {super(data, name || 'circuits');}
    public createItem(data: any): CircuitGroupCircuit {return new CircuitGroupCircuit(data);}
}
export class CircuitGroupCircuit extends EqItem {
    public get circuit(): number {return this.data.circuit;}
    public set circuit(val: number) {this.data.circuit = val;}
    public get desiredStateOn(): boolean {return this.data.desiredStateOn;}
    public set desiredStateOn(val: boolean) {this.data.desiredStateOn = val;}
    public get lightingTheme(): number {return this.data.lightingTheme;}
    public set lightingTheme(val: number) {this.data.lightingTheme = val;}
    public getExtended() {
        let circ = this.get(true);
        circ.circuit = state.circuits.getInterfaceById(circ.circuit);
        return circ;
    }
}
export class CircuitGroupCollection extends EqItemCollection<CircuitGroup> {
    constructor(data: any, name?: string) {super(data, name || "circuitGroups");}
    public createItem(data: any): CircuitGroup {return new CircuitGroup(data);}
    public getInterfaceById(id: number): ICircuitGroup {
        let iGroup: ICircuitGroup = this.getItemById(id, false, {id: id, isActive: false});
        if (!iGroup.isActive) iGroup = sys.lightGroups.getItemById(id, false, {id: id, isActive: false});
        return iGroup;
    }
    public getItemById(id: number, add?: boolean, data?: any): CircuitGroup|LightGroup {
        for (let i = 0; i < this.data.length; i++) {
            if (typeof this.data[i].id !== 'undefined' && this.data[i].id === id) {
                return this.createItem(this.data[i]);
            }
        }
        if (typeof add !== 'undefined' && add)
            return this.add(data || {id: id});
        return sys.lightGroups.getItemById(id, add, data);
    }

}

export class CircuitGroup extends EqItem implements ICircuitGroup, ICircuit {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get eggTimer(): number {return this.data.eggTimer;}
    public set eggTimer(val: number) {this.data.eggTimer = val;}
    public get circuits(): CircuitGroupCircuitCollection {return new CircuitGroupCircuitCollection(this.data, "circuits");}
    public setGroupState(val: boolean) {sys.board.features.setGroupState(this, val);}
    public getExtended() {
        /*todo:  RG - this is returning too much extended info; can't figure out why...
        {
            "id": 192,
            "type": {
                "val": 2,
                "name": "circuit",
                "desc": "Circuit"
            },
            "isActive": true,
            "circuits": [
                {
                    "id": 1,
                    "circuit": {
                        "_hasChanged": false,     <-- should only be returning children of "data" here
                        "data": {
                            "id": 1,
                            "isOn": true,
                            "name": "SpaPUMP",
                            "showInFeatures": true,
                            "type": {
                                "val": 1,
                                "name": "spa",
                                "desc": "SPA"
                            }
                        },
                        "dataName": "circuit"
                    },
                    "desiredStateOn": true
                }]
        }
        */
        let group = this.get(true);
        group.type = sys.board.valueMaps.circuitGroupTypes.transform(group.type);
        group.lightingTheme = sys.board.valueMaps.lightThemes.transform(group.lightingTheme || 0);
        let gstate = this.id !== 0 ? state.lightGroups.getItemById(this.id).getExtended() : state.intellibrite.getExtended();
        group.action = gstate.action;
        group.isOn = gstate.isOn;
        group.circuits = [];
        for (let i = 0; i < this.circuits.length; i++) {
            group.circuits.push(this.circuits.getItemByIndex(i).getExtended());
        }
        return group;
    }
}
export class RemoteCollection extends EqItemCollection<Remote> {
    constructor(data: any, name?: string) {super(data, name || "remotes");}
    public createItem(data: any): Remote {return new Remote(data);}
}
export class Remote extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get type(): number {return this.data.type;}
    public set type(val: number) {this.data.type = val;}
    public get isActive(): boolean {return this.data.isActive;}
    public set isActive(val: boolean) {this.data.isActive = val;}
    public get hardwired(): boolean {return this.data.hardwired;}
    public set hardwired(val: boolean) {this.data.hardwired = val;}
    public get body(): number {return this.data.body;}
    public set body(val: number) {this.data.body = val;}
    public get pumpId(): number {return this.data.pumpId;}
    public set pumpId(val: number) {this.data.pumpId = val;}
    public get address(): number {return this.data.address;}
    public set address(val: number) {this.data.address = val;}
    public get button1(): number {return this.data.button1;}
    public set button1(val: number) {this.data.button1 = val;}
    public get button2(): number {return this.data.button2;}
    public set button2(val: number) {this.data.button2 = val;}
    public get button3(): number {return this.data.button3;}
    public set button3(val: number) {this.data.button3 = val;}
    public get button4(): number {return this.data.button4;}
    public set button4(val: number) {this.data.button4 = val;}
    public get button5(): number {return this.data.button5;}
    public set button5(val: number) {this.data.button5 = val;}
    public get button6(): number {return this.data.button6;}
    public set button6(val: number) {this.data.button6 = val;}
    public get button7(): number {return this.data.button7;}
    public set button7(val: number) {this.data.button7 = val;}
    public get button8(): number {return this.data.button8;}
    public set button8(val: number) {this.data.button8 = val;}
    public get button9(): number {return this.data.button9;}
    public set button9(val: number) {this.data.button9 = val;}
    public get button10(): number {return this.data.button10;}
    public set button10(val: number) {this.data.button10 = val;}
    public set stepSize(val: number) {this.data.stepSize = val;}
    public get stepSize(): number {return this.data.stepSize;}
}
export class SecurityRoleCollection extends EqItemCollection<SecurityRole> {
    constructor(data: any, name?: string) {super(data, name || "roles");}
    public createItem(data: any): SecurityRole {return new SecurityRole(data);}
}
export class SecurityRole extends EqItem {
    public get id(): number {return this.data.id;}
    public set id(val: number) {this.data.id = val;}
    public get name(): string {return this.data.name;}
    public set name(val: string) {this.data.name = val;}
    public get timeout(): number {return this.data.timeout;}
    public set timeout(val: number) {this.data.timeout = val;}
    public get flag1(): number {return this.data.flag1;}
    public set flag1(val: number) {this.data.flag1 = val;}
    public get flag2(): number {return this.data.flag2;}
    public set flag2(val: number) {this.data.flag2 = val;}
    public get pin(): string {return this.data.pin;}
    public set pin(val: string) {this.data.pin = val;}
}
export class Security extends EqItem {
    public get enabled(): boolean {return this.data.enabled;}
    public set enabled(val: boolean) {this.data.enabled = val;}
    public get roles(): SecurityRoleCollection {return new SecurityRoleCollection(this.data, "roles");}
}
export let sys = new PoolSystem();