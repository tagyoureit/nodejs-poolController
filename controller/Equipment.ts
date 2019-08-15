import * as path from 'path';
import * as fs from 'fs';
import * as extend from 'extend';
import { Protocol, Outbound, Response, Message } from './comms/messages/Messages';
import { setTimeout } from 'timers';
import { conn } from './comms/Comms';
import { logger } from '../logger/Logger';
import { state } from './State';
import { Enums, Timestamp, ControllerType } from './Constants';

class PoolFactory
{
    private _controllerType: string;
    private _sys: PoolSystem;
    public get controllerType (): string { return this._controllerType }
    public set controllerType ( ct: string ) { this._controllerType = ct }
    public getPool (): PoolSystem
    {
        console.log( `Getting Pool Context` )

        if ( typeof ( this._sys ) === 'undefined' )
            switch ( this._controllerType )
            {
                case ControllerType.IntelliCenter:
                    this._sys = new IntelliCenterSystem();
                    break;
                case ControllerType.IntelliTouch:
                    this._sys = new IntelliTouchSystem();
                    break;
            }
        sys = this._sys; // overwrite global
        return this._sys;


    }
}

interface PoolSystem
{
    cfgPath: string;
    data: any;
    stopAsync (): void;
    persist (): void;
    checkConfiguration (): void;
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
    security: Security;
    _configQueue: ConfigQueue
}

abstract class PoolSystem implements PoolSystem
{
    constructor()
    {
        this.cfgPath = path.posix.join( process.cwd(), '/data/poolConfig.json' );
    }
    public abstract init ();
    processVersionChanges ( ver: ConfigVersion ) { };
    public controllerType: any;
    public stopAsync ()
    {
        if ( this._timerChanges ) clearTimeout( this._timerChanges );
        if ( this._timerDirty ) clearTimeout( this._timerDirty );
        this._configQueue.close();
    }
    checkConfiguration () { };
    cfgPath: string;
    data: any;
    public _configQueue: ConfigQueue
    protected _lastUpdated: Date;
    protected _isDirty: boolean;
    protected _timerDirty: NodeJS.Timeout;
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
    public remotes: RemoteCollection;
    public security: Security;
    public customNames: CustomNameCollection;
    public intellibrite: IntelliBriteCollection;
    public get dirty (): boolean { return this._isDirty; }
    public set dirty ( val )
    {
        this._isDirty = val;
        this._lastUpdated = new Date();
        this.data.lastUpdated = this._lastUpdated.toLocaleString();
        if ( this._timerDirty )
        {
            clearTimeout( this._timerDirty );
            this._timerDirty = null;
        }
        if ( this._isDirty ) this._timerDirty = setTimeout( sys.persist, 3000 );
    }
    public persist ()
    {
        this._isDirty = false;
        // Don't overwrite the configuration if we failed during the initialization.
        if ( typeof ( sys.circuits ) === "undefined" || !this.circuits === null || typeof ( sys.circuits ) === "undefined" )
        {
            logger.info( `SKIPPING persist equipment because it is empty!` )
            return;

        }
        Promise.resolve()
            .then( () => { fs.writeFileSync( sys.cfgPath, JSON.stringify( sys.data, undefined, 2 ) ); } )
            .catch( function ( err ) { if ( err ) logger.error( 'Error writing pool config %s %s', err, sys.cfgPath ); } );

    }
    protected onchange = ( obj, fn ) =>
    {
        const handler = {
            get ( target, property, receiver )
            {
                const val = Reflect.get( target, property, receiver );
                if ( typeof ( val ) === 'object' && val !== null ) return new Proxy( val, handler );
                return val;
            },
            set ( target, property, value, receiver )
            {
                if ( property !== 'lastUpdated' && Reflect.get( target, property, receiver ) !== value ) fn();
                return Reflect.set( target, property, value, receiver );
            },
            deleteProperty ( target, property )
            {
                if ( property in target )
                {
                    delete target[ property ];
                }
                return true;
            },
        };
        return new Proxy( obj, handler );
    };
    public getSection ( section?: string, opts?: any ): any
    {
        if ( typeof ( section ) === "undefined" || section === 'all' ) return this.data;
        var c: any = this.data;
        if ( section.indexOf( '.' ) !== -1 )
        {
            var arr = section.split( '.' );
            for ( let i = 0; i < arr.length; i++ )
            {
                if ( typeof ( c[ arr[ i ] ] ) === "undefined" )
                {
                    c = null;
                    break;
                }
                else
                    c = c[ arr[ i ] ];
            }
        }
        else
            c = c[ section ];
        return extend( true, {}, opts || {}, c || {} );
    }
}
export class IntelliCenterSystem extends PoolSystem implements PoolSystem
{
    _configQueue = new IntelliCenterConfigQueue();
    public processVersionChanges ( ver: ConfigVersion )
    {
        logger.info( `Requesting ${ PF.controllerType } configuration` )
        var curr = this.configVersion;
        state.status = Enums.ControllerStatus.transform( 1, 0 );
        if ( !curr.equipment || !ver.equipment || curr.equipment !== ver.equipment ) this._configQueue.push( this.equipment.queueConfig( ver.equipment ) );
        if ( this._needsChanges )
        {
            if ( !curr.options || !ver.options || curr.options !== ver.options ) this._configQueue.push( this.general.options.queueConfig( ver.options ) );
        }
        else
            curr.options = ver.options;
        if ( this._needsChanges )
        {
            // Only queue these up if we initiated the change. We are catching all of the configuration changes
            // sent by other controllers so set it if we need to.
            if ( !curr.circuits || !ver.circuits || curr.circuits !== ver.circuits ) this._configQueue.push( this.circuits.queueConfig( ver.circuits ) );
        }
        else
            curr.circuits = ver.circuits;
        if ( !curr.features || !ver.features || curr.features !== ver.features ) this._configQueue.push( this.features.queueConfig( ver.features ) );
        if ( this._needsChanges )
        {
            if ( !curr.pumps || !ver.pumps || curr.pumps !== ver.pumps ) this._configQueue.push( this.pumps.queueConfig( ver.pumps ) );
        }
        else
            curr.pumps = ver.pumps;
        if ( !curr.security || !ver.security || curr.security !== ver.security ) this._configQueue.push( this.security.queueConfig( ver.security ) );
        if ( !curr.remotes || !ver.remotes || curr.remotes !== ver.remotes ) this._configQueue.push( this.remotes.queueConfig( ver.remotes ) );
        if ( !curr.circuitGroups || !ver.circuitGroups || curr.circuitGroups !== ver.circuitGroups ) this._configQueue.push( this.circuitGroups.queueConfig( ver.circuitGroups ) );
        if ( this._needsChanges )
        {
            if ( !curr.chlorinators || !ver.chlorinators || curr.chlorinators !== ver.chlorinators ) this._configQueue.push( this.chlorinators.queueConfig( ver.chlorinators ) );
        }
        else
            curr.chlorinators = ver.chlorinators;
        //if (!curr.intellichem || !ver.intellichem || curr.intellichem !== ver.intellichem) this.intellichem.queueConfig(ver.intellichem);
        if ( !curr.valves || !ver.valves || curr.valves !== ver.valves ) this._configQueue.push( this.valves.queueConfig( ver.valves ) );
        if ( !curr.heaters || !ver.heaters || curr.heaters !== ver.heaters ) this._configQueue.push( this.heaters.queueConfig( ver.heaters ) );
        if ( !curr.general || !ver.general || curr.general !== ver.general ) this._configQueue.push( this.general.queueConfig( ver.general ) );
        if ( !curr.covers || !ver.covers || curr.covers !== ver.covers ) this._configQueue.push( this.covers.queueConfig( ver.covers ) );
        if ( !curr.schedules || !ver.schedules || curr.schedules !== ver.schedules ) this._configQueue.push( this.schedules.queueConfig( ver.schedules ) );
        //if (!curr.extSchedules || !ver.extSchedules || curr.extSchedules !== ver.extSchedules) this._IntelliCenterConfigQueue.push(this.schedules.queueExtConfig(ver.extSchedules));
        if ( sys._configQueue.remainingItems > 0 )
            setTimeout( sys._configQueue.processNext, 50 );
        else
            state.status = 0;
        state.emitControllerChange();
        this._needsChanges = false;
        this.data.controllerType = this.controllerType;
    }

    public checkConfiguration ()
    {
        this._needsChanges = true;
        // Send out a message to the outdoor panel that we need info about
        // our current configuration.
        let out: Outbound = new Outbound( Protocol.Broadcast, Message.pluginAddress, 15, 228, [ 0 ], 5,
            new Response( 15, 16, 164, [], 164 ) );
        conn.queueSendMessage( out );
    }

    public init ()
    {
        this.data.controllerType = this.controllerType;
        console.log( `Init ${ PF.controllerType }` )
        var cfg = fs.existsSync( this.cfgPath ) ? JSON.parse( fs.readFileSync( this.cfgPath, 'utf8' ) ) : {};
        var cfgDefault = fs.existsSync( path.posix.join( process.cwd(), '/defaultPool.json' ) ) ? JSON.parse( fs.readFileSync( path.posix.join( process.cwd(), '/defaultPool.json' ), 'utf8' ) ) : {};
        cfg = extend( true, {}, cfgDefault, cfg );
        this.data = this.onchange( cfg, function () { sys.dirty = true; } );
        this.general = new IntelliCenterGeneral( this.data, 'pool' );
        this.equipment = new IntelliCenterEquipment( this.data, 'equipment' );
        this.configVersion = new ConfigVersion( this.data, 'configVersion' );
        this.bodies = new BodyCollection( this.data, 'bodies' );
        this.schedules = new IntelliCenterScheduleCollection( this.data, 'schedules' );
        this.circuits = new IntelliCenterCircuitCollection( this.data, 'circuits' );
        this.features = new FeatureCollection( this.data, 'features' );
        this.pumps = new IntelliCenterPumpCollection( this.data, 'pumps' );
        this.chlorinators = new IntelliCenterChlorinatorCollection( this.data, 'chlorinators' );
        this.valves = new IntelliCenterValveCollection( this.data, 'valves' );
        this.heaters = new IntelliCenterHeaterCollection( this.data, 'heaters' );
        this.covers = new CoverCollection( this.data, 'covers' );
        this.circuitGroups = new CircuitGroupCollection( this.data, 'circuitGroups' );
        this.remotes = new IntelliCenterRemoteCollection( this.data, 'remotes' );
        this.security = new Security( this.data, 'security' );
        setTimeout( function () { sys.checkConfiguration(); }, 3000 );
    }
}

export class IntelliTouchSystem extends PoolSystem 
{
    _configQueue = new IntelliTouchConfigQueue();
    // IntelliTouch Only
    public customNames: CustomNameCollection;

    // public processVersionChanges ( ver: ConfigVersion ) { }
    public checkConfiguration () { };
    public stopAsync ()
    {
        if ( this._timerChanges ) clearTimeout( this._timerChanges );
        if ( this._timerDirty ) clearTimeout( this._timerDirty );
        this._configQueue.close();
    }
    public init ()
    {
        console.log( `Init ${ PF.controllerType }` );
        this.controllerType = PF.controllerType;
        var cfg = fs.existsSync( this.cfgPath ) ? JSON.parse( fs.readFileSync( this.cfgPath, 'utf8' ) ) : {};
        // TODO: Fix default file
        var cfgDefault = fs.existsSync( path.posix.join( process.cwd(), '/defaultPool.json' ) ) ? JSON.parse( fs.readFileSync( path.posix.join( process.cwd(), '/data/defaultIntelliTouchPool.json' ), 'utf8' ) ) : {};
        cfg = extend( true, {}, cfgDefault, cfg );
        this.data = this.onchange( cfg, function () { sys.dirty = true; } );
        this.data.controllerType = PF.controllerType;
        this.general = new General( this.data, 'pool' );
        this.bodies = new BodyCollection( this.data, 'bodies' );
        this.schedules = new IntelliTouchScheduleCollection( this.data, 'schedules' );
        this.eggTimers = new EggTimerCollection( this.data, 'eggTimers' )
        this.customNames = new CustomNameCollection( this.data, 'customNames' );
        this.equipment = new IntelliTouchEquipment( this.data, 'equipment' );
        this.valves = new IntelliTouchValveCollection( this.data, 'valves' );
        this.circuits = new IntelliTouchCircuitCollection( this.data, 'circuits' );
        this.features = new FeatureCollection( this.data, 'features' );
        this.pumps = new IntelliTouchPumpCollection( this.data, 'pumps' );
        this.chlorinators = new IntelliTouchChlorinatorCollection( this.data, 'chlorinators' );
        this.remotes = new IntelliTouchRemoteCollection( this.data, 'remotes' );
        this.intellibrite = new IntelliBriteCollection( this.data, 'intellibrite' );
        this.heaters = new IntelliTouchHeaterCollection( this.data, 'heaters' );
        this.general = new General( this.data, 'pool' );
        this.requestConfiguration()
    }
    public requestConfiguration ()
    {
        if ( conn.mockPort )
        {
            logger.info( `Skipping Controller Init because MockPort enabled.` )
        }
        else
        {
            logger.info( `Requesting ${ this.controllerType } configuration` )
            let reqDateTime = new IntelliTouchConfigRequest( 197, [ 0 ] );
            this._configQueue.push( reqDateTime );
            this._configQueue.push( this.heaters.queueConfig() );
            this._configQueue.push( this.heaters.queueConfigHeatPump() );
            this._configQueue.push( this.customNames.queueConfig() )
            this._configQueue.push( this.circuits.queueConfig() )
            this._configQueue.push( this.schedules.queueConfig() );
            let reqDelays = new IntelliTouchConfigRequest( 227, [ 0 ] );
            this._configQueue.push( reqDelays );
            let reqSettings = new IntelliTouchConfigRequest( 232, [ 0 ] );
            this._configQueue.push( reqSettings );
            this._configQueue.push( this.remotes.queueConfig() );
            this._configQueue.push( this.remotes.queueConfigIs4Is10() );
            this._configQueue.push( this.remotes.queueConfigSpaSide() );
            this._configQueue.push( this.valves.queueConfig() );
            this._configQueue.push( this.intellibrite.queueConfig() );
            let hsCircs = new IntelliTouchConfigRequest( 222, [ 0 ] );
            this._configQueue.push(hsCircs )
            this._configQueue.push( this.pumps.queueConfig() );
        }

        if ( sys._configQueue.remainingItems > 0 )
        {
            // var self = this
            setTimeout( () => sys._configQueue.processNext(), 50 );
        }
        else
            state.status = 0;
        state.emitControllerChange();
        super._needsChanges = false;
    }
}


interface IEqItemCreator<T> { ctor ( data: any, name: string ): T; }
class EqItem implements IEqItemCreator<EqItem> {
    protected data: any;
    ctor ( data, name?: string ): EqItem { return new EqItem( data, name ); };
    constructor( data, name?: string )
    {
        if ( typeof ( name ) !== "undefined" )
        {
            if ( typeof ( data[ name ] ) === "undefined" ) data[ name ] = {};
            this.data = data[ name ];
        }
        else
            this.data = data;
    }
    public get (): any { return this.data; }
}
class EqItemCollection<T> {
    protected data: any;
    constructor( data: [], name: string )
    {
        if ( typeof ( data[ name ] ) === "undefined" ) data[ name ] = [];
        this.data = data[ name ];
    }
    public getItemByIndex ( ndx: number, add?: boolean ): T
    {
        return ( this.data.length > ndx ) ? this.createItem( this.data[ ndx ] ) : ( typeof ( add ) !== "undefined" && add ) ? this.add( this.createItem( { id: ndx + 1 } ) ) : this.createItem( { id: ndx + 1 } );
    }
    public getItemById ( id: number, add?: boolean ): T
    {
        for ( var i = 0; i < this.data.length; i++ )
        {
            if ( typeof ( this.data[ i ].id ) !== "undefined" && this.data[ i ].id === id )
            {
                return this.createItem( this.data[ i ] );
            }
        }
        if ( typeof ( add ) !== "undefined" && add )
        {
            return this.add( { id: id } );
        }
        return this.createItem( { id: id } );
    }
    public removeItemById ( id: number ): T
    {
        let rem: T = null;
        for ( let i = 0; i < this.data.length; i++ )
        {
            if ( typeof ( this.data[ i ].id ) !== "undefined" && this.data[ i ].id === id )
            {
                rem = this.data.splice( i, 1 );
            }
        }
        return rem;
    }
    public createItem ( data: any ): T { return new EqItem( data ) as unknown as T; };
    public clear () { this.data.length = 0; }
    public get length (): number { return typeof ( this.data ) !== "undefined" ? this.data.length : 0; }
    public add ( obj: any ): T { this.data.push( obj ); return this.createItem( obj ); }
    public get (): any { return this.data; }
}
export interface General
{
    queueConfig ( ver: number ): ConfigRequest;
}
export class General extends EqItem
{
    ctor ( data ): General { return new General( data, name || 'pool' ); }
    public get alias (): string { return this.data.alias; }
    public set alias ( val: string ) { this.data.alias = val; }
    public get owner (): Owner { return new Owner( this.data, 'owner' ); }
    public get options (): Options { return new Options( this.data, 'options' ); }
    public get location (): Location { return new Location( this.data, 'location' ); }
}
export class IntelliCenterGeneral extends General
{
    public queueConfig ( ver: number ): ConfigRequest
    {
        return new IntelliCenterConfigRequest( 12, ver, [ 0, 1, 2, 3, 4, 5, 6, 7 ] );
    }
}
// Custom Names are IntelliTouch Only
export class CustomNameCollection extends EqItemCollection<CustomName>{
    constructor( data: any, name?: string ) { super( data, name || 'customNames' ); }
    public createItem ( data: any ): CustomName { return new CustomName( data ); }
    public queueConfig (): ConfigRequest
    {
        let req = new IntelliTouchConfigRequest( 202, [] );
        req.fillRange( 0, sys.equipment.maxCustomNames - 1 );
        return req;
    }
}
export class CustomName extends EqItem
{
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
}

export class Owner extends EqItem
{
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get phone (): string { return this.data.phone; }
    public set phone ( val: string ) { this.data.phone = val; }
    public get email (): string { return this.data.email; }
    public set email ( val: string ) { this.data.email = val; }
    public get email2 (): string { return this.data.email2; }
    public set email2 ( val: string ) { this.data.email2 = val; }
    public get phone2 (): string { return this.data.phone2; }
    public set phone2 ( val: string ) { this.data.phone2 = val; }
}
export class SensorCollection extends EqItemCollection<Sensor> {
    constructor( data: any, name?: string ) { super( data, name || 'sensors' ); }
    public createItem ( data: any ): Sensor { return new Sensor( data ); }
}
export class Sensor extends EqItem
{
    public get calibration (): number { return this.data.calibration; }
    public set calibration ( val: number ) { this.data.calibration = val; }
}
export class Options extends EqItem
{
    public get clockMode (): number { return this.data.clockMode; }
    public set clockMode ( val: number ) { this.data.clockMode = val; }
    public get units (): string { return this.data.units; }
    public set units ( val: string ) { this.data.units = val; }
    public get clockSource (): string { return this.data.clockSource; }
    public set clockSource ( val: string ) { this.data.clockSource = val; }
    public get adjustDST (): boolean { return this.data.adjustDST; }
    public set adjustDST ( val: boolean ) { this.data.adjustDST = val; }
    public get manualPriority (): boolean { return this.data.manualPriority; }
    public set manualPriority ( val: boolean ) { this.data.manualPriority = val; }
    public get vacationMode (): boolean { return this.data.vacationMode; }
    public set vacationMode ( val: boolean ) { this.data.vacationMode = val; }
    public get manualHeat (): boolean { return this.data.manualHeat; }
    public set manualHeat ( val: boolean ) { this.data.manualHeat = val; }
    public get pumpDelay (): boolean { return this.pumpDelay; }
    public set pumpDelay ( val: boolean ) { this.data.pumpDelay = val; }
    public get cooldownDelay (): boolean { return this.data.cooldownDelay; }
    public set cooldownDelay ( val: boolean ) { this.data.cooldownDelay = val; }
    public get sensors (): SensorCollection { return new SensorCollection( this.data ); }
    public queueConfig ( ver: number ): ConfigRequest { return new IntelliCenterConfigRequest( 0, ver, [ 0, 1 ] ); }
    public get airTempAdj (): number { return typeof ( this.data.airTempAdj ) === 'undefined' ? 0 : this.data.airTempAdj; }
    public set airTempAdj ( val: number ) { this.data.airTempAdj = val; }
    public get waterTempAdj1 (): number { return typeof ( this.data.waterTempAdj1 ) === 'undefined' ? 0 : this.data.waterTempAdj1; }
    public set waterTempAdj1 ( val: number ) { this.data.waterTempAdj1 = val; }
    public get solarTempAdj1 (): number { return typeof ( this.data.solarTempAdj1 ) === 'undefined' ? 0 : this.data.solarTempAdj1; }
    public set solarTempAdj1 ( val: number ) { this.data.solarTempAdj1 = val; }
    public get waterTempAdj2 (): number { return typeof ( this.data.waterTempAdj2 ) === 'undefined' ? 0 : this.data.waterTempAdj2; }
    public set waterTempAdj2 ( val: number ) { this.data.waterTempAdj2 = val; }
    public get solarTempAdj2 (): number { return typeof ( this.data.solarTempAdj2 ) === 'undefined' ? 0 : this.data.solarTempAdj2; }
    public set solarTempAdj2 ( val: number ) { this.data.solarTempAd2 = val; }

}
export class Location extends EqItem
{
    public get address (): string { return this.data.address; }
    public set address ( val: string ) { this.data.address = val; }
    public get city (): string { return this.data.city; }
    public set city ( val: string ) { this.data.city = val; }
    public get state (): string { return this.data.state; }
    public set state ( val: string ) { this.data.state = val; }
    public get zip (): string { return this.data.zip; }
    public set zip ( val: string ) { this.data.zip = val; }
    public get country (): string { return this.data.country; }
    public set country ( val: string ) { this.data.country = val; }
    public get latitude (): number { return this.data.latitude; }
    public set latitude ( val: number ) { this.data.latitude = val; }
    public get longitude (): number { return this.data.longitude; }
    public set longitude ( val: number ) { this.data.longitude = val; }
}
export class ExpansionPanelCollection extends EqItemCollection<ExpansionPanel> {
    constructor( data: any, name?: string ) { super( data, name || 'expansions' ); }
    public createItem ( data: any ): ExpansionPanel { return new ExpansionPanel( data ); }
}
export class ExpansionPanel extends EqItem
{
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
}
export class HighSpeedCircuitCollection extends EqItemCollection<HighSpeedCircuit> {
    constructor( data: any, name?: string ) { super( data, name || 'highSpeedCircuits' ); }
    public createItem ( data: any ): HighSpeedCircuit { return new HighSpeedCircuit( data ); }
}
export class HighSpeedCircuit extends EqItem
{
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
}
export interface Equipment
{
    maxCustomNames: number;
    maxPumps: number;
    queueConfig ( ver?: number ): ConfigRequest;
}
export class Equipment extends EqItem
{
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get shared (): boolean { return this.data.shared; }
    public set shared ( val: boolean ) { this.data.shared = val; }
    public get maxBodies (): number { return this.data.maxBodies || 6; }
    public set maxBodies ( val: number ) { this.data.maxBodies = val; }
    public get maxValves (): number { return this.data.maxValves || 26; }
    public set maxValves ( val: number ) { this.data.maxValves = val; }
    public get maxCircuits (): number { return this.data.maxCircuits || 11; }
    public set maxCircuits ( val: number ) { this.data.maxCircuits = val; }
    public get maxFeatures (): number { return this.data.maxFeatures || 32 }
    public set maxFeatures ( val: number ) { this.data.maxFeatures = val; }
    public set maxSchedules ( val: number ) { this.data.maxSchedules = val; }
    public get maxRemotes (): number { return this.data.maxRemotes || 9 }
    public set maxRemotes ( val: number ) { this.data.maxRemotes = val; }
    public get maxCircuitGroups (): number { return this.data.maxCircuitGroups || 32 }
    public set maxCircuitGroups ( val: number ) { this.data.maxCircuitGroups = val; }
    public set maxChlorinators ( val: number ) { this.data.maxChlorinators = val; }
    public get maxHeaters (): number { return this.data.maxHeaters || 16 }
    public set maxHeaters ( val: number ) { this.data.maxHeaters = val; }
    public get model (): string { return this.data.model; }
    public set model ( val: string ) { this.data.model = val; }
    public get maxIntelliBrites (): number { return this.data.maxIntelliBrites; }
    public set maxIntelliBrites ( val: number ) { this.data.maxIntelliBrites = val }
    public get expansions (): ExpansionPanelCollection { return new ExpansionPanelCollection( this.data, 'expansions' ); }
    public get highSpeedCircuits (): HighSpeedCircuitCollection { return new HighSpeedCircuitCollection( this.data, 'highSpeedCircuits' ); }
    public set controllerFirmware ( val: string ) { this.data.softwareVersion = val; }
    public get controllerFirmware (): string { return this.data.softwareVersion; }
    public set bootloaderVersion ( val: string )
    { this.data.bootloaderVersion = val; }
    public get bootloaderVersion (): string { return this.data.bootloaderVersion;}
}
export class IntelliCenterEquipment extends Equipment
{
    public get maxSchedules (): number { return this.data.maxSchedules || 100 }
    public get maxChlorinators (): number { return this.data.maxChlorinators || 2 }
    public get maxPumps (): number { return this.data.maxPumps || 16 }
    public set maxPumps ( val: number ) { this.data.maxPumps = val; }
    public queueConfig ( ver: number ): ConfigRequest { return new IntelliCenterConfigRequest( 13, ver, [ 0, 1, 2, 3 ] ); }
}
export class IntelliTouchEquipment extends Equipment
{
    public get maxChlorinators (): number { return this.data.maxChlorinators || 1 }
    public get maxSchedules (): number { return this.data.maxSchedules || 12 }
    public get maxPumps (): number { return this.data.maxPumps || 1 }
    public set maxPumps ( val: number ) { this.data.maxPumps = val; }
    public get maxCustomNames (): number { return this.data.maxCustomNames || 10; }
    public set maxCustomNames ( val: number ) { this.data.maxCustomNames = val; }
}

export class ConfigVersion extends EqItem
{
    public get options (): number { return this.data.options; }
    public set options ( val: number ) { this.data.options = val; }
    public get circuits (): number { return this.data.circuits; }
    public set circuits ( val: number ) { this.data.circuits = val; }
    public get features (): number { return this.data.features; }
    public set features ( val: number ) { this.data.features = val; }
    public get pumps (): number { return this.data.pumps; }
    public set pumps ( val: number ) { this.data.pumps = val; }
    public get remotes (): number { return this.data.remotes; }
    public set remotes ( val: number ) { this.data.remotes = val; }
    public get circuitGroups (): number { return this.data.circuitGroups; }
    public set circuitGroups ( val: number ) { this.data.circuitGroups = val; }
    public get chlorinators (): number { return this.data.chlorinators; }
    public set chlorinators ( val: number ) { this.data.chlorinators = val; }
    public get intellichem (): number { return this.data.intellichem; }
    public set intellichem ( val: number ) { this.data.intellichem = val; }
    public get extSchedules (): number { return this.data.extSchedules; }
    public set extSchedules ( val: number ) { this.data.extSchedules = val; }

    public get valves (): number { return this.data.valves; }
    public set valves ( val: number ) { this.data.valves = val; }
    public get heaters (): number { return this.data.heaters; }
    public set heaters ( val: number ) { this.data.heaters = val; }
    public get security (): number { return this.data.security; }
    public set security ( val: number ) { this.data.security = val; }
    public get general (): number { return this.data.general; }
    public set general ( val: number ) { this.data.general = val; }
    public get equipment (): number { return this.data.equipment; }
    public set equipment ( val: number ) { this.data.equipment = val; }
    public get covers (): number { return this.data.covers; }
    public set covers ( val: number ) { this.data.covers = val; }
    public get schedules (): number { return this.data.schedules; }
    public set schedules ( val: number ) { this.data.schedules = val; }
}
export class BodyCollection extends EqItemCollection<Body> {
    constructor( data: any, name?: string ) { super( data, name || 'bodies' ); }
    public createItem ( data: any ): Body { return new Body( data ); }
    public setHeatMode ( id: number, mode: number )
    {
        let body = this.getItemById( id );
        body.setHeatMode( mode );
    }
    public setHeatSetpoint ( id: number, setPoint: number )
    {
        let body = this.getItemById( id );
        body.setHeatSetpoint( setPoint );

    }
}
export class Body extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = this.data.id; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get alias (): string { return this.data.alias; }
    public set alias ( val: string ) { this.data.alias = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get capacity (): number { return this.data.capacity; }
    public set capacity ( val: number ) { this.data.capacity = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get manualHeat (): boolean { return this.data.manualHeat; }
    public set manualHeat ( val: boolean ) { this.data.manualHeat = val; }
    public get setPoint (): number { return this.data.setPoint; }
    public set setPoint ( val: number ) { this.data.setPoint = val; }
    public get heatMode (): number { return this.data.heatMode; }
    public set heatMode ( val: number ) { this.data.heatMode = val; }
    public getHeatModes ()
    {
        var heatModes = [];
        heatModes.push( Enums.HeatMode.transform( 0 ) );
        for ( let i = 1; i <= sys.heaters.length; i++ )
        {
            let heater = sys.heaters.getItemById( i );
            if ( heater.body === 32 || // Any
                ( heater.body === 1 && this.id === 2 ) || // Spa
                ( heater.body === 0 && this.id === 1 ) )
            { // Pool
                // Pool and spa.
                if ( heater.type === 1 ) heatModes.push( Enums.HeatMode.transform( 3 ) );
                if ( heater.type === 2 )
                {
                    heatModes.push( Enums.HeatMode.transform( 5 ) );
                    if ( heatModes.length > 2 ) heatModes.push( Enums.HeatMode.transform( 21 ) );
                }
            }
        }
        return heatModes;
    }
    public setHeatMode ( mode: number )
    {
        var self = this;
        let byte2 = 18;
        let mode1 = sys.bodies.getItemById( 1 ).setPoint || 100,
            mode2 = sys.bodies.getItemById( 2 ).setPoint || 100,
            mode3 = sys.bodies.getItemById( 3 ).setPoint || 100,
            mode4 = sys.bodies.getItemById( 4 ).setPoint || 100;
        console.log( { body: this.id, heatMode: mode } );
        switch ( this.id )
        {
            case 1:
                byte2 = 22;
                mode1 = mode;
                break;
            case 2:
                byte2 = 23;
                mode2 = mode;
                break;
            case 3:
                byte2 = 24;
                mode3 = mode;
                break;
            case 4:
                byte2 = 25;
                mode4 = mode;
                break;
        }
        let out = new Outbound( Protocol.Broadcast, 16, 15, 168, [ 0, 0, byte2, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 100, 100, 100, 100, mode1, mode2, mode3, mode4, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0 ], 0,
            new Response( 16, Message.pluginAddress, 1, [ 168 ], null, function ( msg )
            {
                if ( !msg.failed )
                {
                    self.heatMode = mode;
                    state.temps.bodies.getItemById( self.id ).heatMode = mode;
                }
            } ) );
        conn.queueSendMessage( out );

    }
    public setHeatSetpoint ( setPoint: number )
    {
        var self = this;
        // Command for increasing the spa set temp to 102.
        //[165, 63, 15, 16, 168, 41][0, 0, 20, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100, 102, 103, 0, 3, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 1][5, 245]
        // Command for setting heat mode off.
        //[165, 63, 15, 16, 168, 41][0, 0, 23, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100, 102, 103, 0, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 1][5, 245]
        // Command for setting heat mode on.
        //Me
        //[255, 0, 255][165, 63, 15, 16, 168, 41][0, 0, 18, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 74, 100, 99, 100, 0, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 1][5, 230]
        //Them
        //[255, 0, 255][165, 63, 15, 16, 168, 41][0, 0, 18, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 75, 100, 99, 103, 5, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0][5, 238]
        let byte2 = 18;
        let temp1 = sys.bodies.getItemById( 1 ).setPoint || 100,
            temp2 = sys.bodies.getItemById( 2 ).setPoint || 100,
            temp3 = sys.bodies.getItemById( 3 ).setPoint || 100,
            temp4 = sys.bodies.getItemById( 4 ).setPoint || 100;
        console.log( { body: this.id, setPoint: setPoint } );
        switch ( this.id )
        {
            case 1:
                byte2 = 18;
                temp1 = setPoint;
                break;
            case 2:
                byte2 = 20;
                temp2 = setPoint;
                break;
            case 3:
                byte2 = 19;
                temp3 = setPoint;
                break;
            case 4:
                byte2 = 21;
                temp4 = setPoint;
                break;
        }
        let out = new Outbound( Protocol.Broadcast, 16, 15, 168, [ 0, 0, byte2, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, temp1, temp3, temp2, temp4, 0, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0 ], 0,
            new Response( 16, Message.pluginAddress, 1, [ 168 ], null, function ( msg )
            {
                if ( !msg.failed )
                {
                    self.setPoint = setPoint;
                    state.temps.bodies.getItemById( self.id ).setPoint = setPoint;
                }
            } ) );
        conn.queueSendMessage( out );
    }
}
export interface ScheduleCollection
{
    createitem ( data: any ): void;
    queueConfig ( ver?: number ): ConfigRequest;
}
export class ScheduleCollection extends EqItemCollection<Schedule> {
    constructor( data: any, name?: string ) { super( data, name || 'schedules' ); }
    public createItem ( data: any ): Schedule { return new Schedule( data ); }
}
export class IntelliCenterScheduleCollection extends ScheduleCollection
{
    public queueConfig ( ver: number ): ConfigRequest
    {
        var self = this;
        return new IntelliCenterConfigRequest( 3, ver, [ 0, 1, 2, 3, 4 ], function ( req: ConfigRequest ) { self.queueSchedAttrs( req ); } );
    }
    private queueSchedAttrs ( req: ConfigRequest )
    {
        if ( this.data.length > 0 )
        {
            req.fillRange( 5, 4 + Math.min( Math.ceil( this.data.length / 40 ), 7 ) ); // Circuits
            req.fillRange( 8, 7 + Math.min( Math.ceil( this.data.length / 40 ), 10 ) ); // Flags
            req.fillRange( 11, 10 + Math.min( Math.ceil( this.data.length / 40 ), 13 ) ); // Schedule days bitmask
            req.fillRange( 14, 13 + Math.min( Math.ceil( this.data.length / 40 ), 16 ) ); // Unknown (one byte per schedule)
            req.fillRange( 17, 16 + Math.min( Math.ceil( this.data.length / 40 ), 19 ) ); // Unknown (one byte per schedule)
            req.fillRange( 20, 19 + Math.min( Math.ceil( this.data.length / 40 ), 22 ) ); // Unknown (one byte per schedule)
            req.fillRange( 23, 22 + Math.min( Math.ceil( this.data.length / 20 ), 26 ) ); // End Time
            req.fillRange( 28, 27 + Math.min( Math.ceil( this.data.length / 40 ), 30 ) ); // Heat Mode
            req.fillRange( 31, 30 + Math.min( Math.ceil( this.data.length / 40 ), 33 ) ); // Heat Mode
            req.fillRange( 34, 33 + Math.min( Math.ceil( this.data.length / 40 ), 36 ) ); // Heat Mode

        }
    }
    public queueExtConfig ( ver: number ): ConfigRequest { return new IntelliCenterConfigRequest( 3, ver, [] ) };
}
export class IntelliTouchScheduleCollection extends ScheduleCollection
{
    public queueConfig (): ConfigRequest
    {
        let req = new IntelliTouchConfigRequest( 209, [] );
        req.fillRange( 0, sys.equipment.maxSchedules );
        return req;
    }
}
export class Schedule extends EqItem
{
    constructor( data: any )
    {
        super( data );
        if ( typeof ( data.startDate ) === "undefined" ) this._startDate = new Date();
        else this._startDate = new Date( data.startDate );
        if ( isNaN( this._startDate.getTime() ) ) this._startDate = new Date();
    }
    private _startDate: Date = new Date();
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get startTime (): number { return this.data.startTime; }
    public set startTime ( val: number ) { this.data.startTime = val; }
    public get endTime (): number { return this.data.endTime; }
    public set endTime ( val: number ) { this.data.endTime = val; }
    public get scheduleDays (): number { return this.data.scheduleDays; }
    public set scheduleDays ( val: number ) { this.data.scheduleDays = val; }
    public get circuit (): number { return this.data.circuit; }
    public set circuit ( val: number ) { this.data.circuit = val; }
    public get heatSource (): number { return this.data.heatSource; }
    public set heatSource ( val: number ) { this.data.heatSource = val; }
    public get heatSetpoint (): number { return this.data.heatSetpoint; }
    public set heatSetpoint ( val: number ) { this.data.heatSetpoint = val; }

    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get runOnce (): number { return this.data.runOnce; }
    public set runOnce ( val: number ) { this.data.runOnce = val; }
    public get startMonth (): number { return this._startDate.getMonth() + 1; }
    public set startMonth ( val: number ) { this._startDate.setMonth( val - 1 ); this._saveStartDate(); }
    public get startDay (): number { return this._startDate.getDate(); }
    public set startDay ( val: number ) { this._startDate.setDate( val ); this._saveStartDate(); }
    public get startYear (): number { return this._startDate.getFullYear(); }
    public set startYear ( val: number ) { this._startDate.setFullYear( val < 100 ? val + 2000 : val ); this._saveStartDate(); }
    public get startDate (): Date { return this._startDate; }
    public set startDate ( val: Date ) { this._startDate = val; }
    private _saveStartDate ()
    {
        this.startDate.setHours( 0, 0, 0, 0 );
        this.data.startDate = Timestamp.toISOLocal( this.startDate );
    }
    public get flags (): number { return this.data.flags; }
    public set flags ( val: number ) { this.data.flags = val; }
    public createConfigMessage (): Outbound
    {
        return Outbound.createMessage( 168, [ 3, 0, this.id - 1,
            this.startTime - ( Math.floor( this.startTime / 256 ) * 256 ), Math.floor( this.startTime / 256 ),
            this.endTime - ( Math.floor( this.endTime / 256 ) * 256 ), Math.floor( this.endTime / 256 ),
            this.circuit - 1, this.runOnce, this.scheduleDays, this.startMonth, this.startDay, this.startYear - 2000,
            this.heatSource, this.heatSetpoint, this.flags ], 0 );
    }
    public set ( obj: any )
    {
        // We are going to extract the properties from
        // the object then send a related message to set it
        // on the controller.
        if ( typeof ( obj.startTime ) === 'number' ) this.startTime = obj.startTime;
        if ( typeof ( obj.endTime ) === 'number' ) this.endTime = obj.endTime;
        if ( typeof ( obj.scheduleType ) === 'number' ) this.runOnce = ( this.runOnce & 0x007F ) + ( ( obj.scheduleType > 0 ) ? 128 : 0 );
        if ( typeof ( obj.scheduleDays ) === 'number' )
        {
            if ( ( this.runOnce & 128 ) > 0 ) this.runOnce = ( this.runOnce & 0x00FF & obj.scheduleDays );
            else this.scheduleDays = obj.scheduleDays & 0x00FF;
        }
        if ( typeof ( obj.circuit ) === 'number' ) this.circuit = obj.circiut;
        let csched = state.schedules.getItemById( this.id, true );
        csched.startTime = this.startTime;
        csched.endTime = this.endTime;
        csched.circuit = this.circuit;
        csched.heatSetpoint = this.heatSetpoint;
        csched.heatSource = this.heatSource;
        csched.scheduleDays = ( ( this.runOnce & 128 ) > 0 ) ? this.runOnce : this.scheduleDays;
        csched.scheduleType = this.runOnce;
        csched.emitEquipmentChange();
        conn.queueSendMessage( this.createConfigMessage() ); // Send it off in a letter to yourself.
    }
}
export class EggTimerCollection extends EqItemCollection<EggTimer> {
    constructor( data: any, name?: string ) { super( data, name || 'eggTimers' ); }
    public createItem ( data: any ): EggTimer { return new EggTimer( data ); }
}
export class EggTimer extends EqItem
{
    constructor( data: any )
    {
        super( data );
        if ( typeof ( data.startDate ) === "undefined" ) this._startDate = new Date();
        else this._startDate = new Date( data.startDate );
        if ( isNaN( this._startDate.getTime() ) ) this._startDate = new Date();
    }
    private _startDate: Date = new Date();
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get runTime (): number { return this.data.runTime; }
    public set runTime ( val: number ) { this.data.runTime = val; }
    public get circuit (): number { return this.data.circuit; }
    public set circuit ( val: number ) { this.data.circuit = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
}
abstract class CircuitCollection extends EqItemCollection<Circuit> 
{
    constructor( data: any, name?: string ) { super( data, name || 'circuits' ); }
    public createItem ( data: any ): Circuit { return new Circuit( data ); }
    public abstract queueConfig ( ver?: number ): ConfigRequest;
}
export class IntelliCenterCircuitCollection extends CircuitCollection
{
    constructor( data: any, name?: string ) { super( data, name || 'circuits' ); }
    public queueConfig ( ver: number ): IntelliCenterConfigRequest
    {
        var req = new IntelliCenterConfigRequest( 1, ver, [ 0, 1, 2 ] );
        // Only add in the items that we need.
        req.fillRange( 3, Math.min( Math.ceil( sys.equipment.maxCircuits / 2 ) + 3, 24 ) );
        req.fillRange( 26, 29 );
        return req;
    }
    public add ( obj: any ): Circuit
    {
        this.data.push( obj );
        var circuit = this.createItem( obj );
        if ( typeof ( circuit.name ) === "undefined" ) circuit.name = IntelliCenterCircuit.getIdName( circuit.id );
        return circuit;
    }
}
export class IntelliTouchCircuitCollection extends CircuitCollection
{
    constructor( data: any, name?: string ) { super( data, name || 'circuits' ); }
    public queueConfig (): IntelliTouchConfigRequest
    {
        var req = new IntelliTouchConfigRequest( 203, [] );
        req.fillRange( 1, sys.equipment.maxCircuits );
        return req;
    }
}
export interface Circuit
{
    requireHighSpeed: boolean;
    macro: boolean;
    getLightThemes (): any;
}
export class Circuit extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get freeze (): boolean { return this.data.freeze; }
    public set freeze ( val: boolean ) { this.data.freeze = val; }
    public get showInFeatures (): boolean { return this.data.showInFeatures; }
    public set showInFeatures ( val: boolean ) { this.data.showInFeatures = val; }
    public get showInCircuits (): boolean { return this.data.showInCircuits; }
    public set showInCircuits ( val: boolean ) { this.data.showInCircuits = val; }
    public get eggTimer (): number { return this.data.eggTimer; }
    public set eggTimer ( val: number ) { this.data.eggTimer = val; }
    public get lightingTheme (): number { return this.data.lightingTheme; }
    public set lightingTheme ( val: number ) { this.data.lightingTheme = val; }
    public get level (): number { return this.data.level; }
    public set level ( val: number ) { this.data.level = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get intellibrite (): IntelliBrite
    {
        if ( typeof ( this.data.intellibrite ) === 'undefined' ) { return new IntelliBrite( this.data, 'intellibrite' ) } else return this.data.intellibrite
    }
    public removeIntelliBrite (): void { delete this.data.intellibrite };

}
export class IntelliCenterCircuit extends Circuit
{
    public static getIdName ( id: number )
    {
        var defName = 'Aux' + ( id + 1 ).toString();
        if ( id === 0 ) defName = 'Spa';
        else if ( id === 5 ) defName = 'Pool';
        else if ( id < 5 ) defName = 'Aux' + id.toString();
        return defName;
    }
    public getLightThemes ()
    {
        let themes = [];
        switch ( this.type )
        {
            case 5: // Intellibrite
            case 8: // Magicstream
                return Enums.LightThemes.get();
            default:
                return [];
        }
    }
}
export class IntelliTouchCircuit extends Circuit
{
    // public static getIdName ( id: number )
    // {
    //     var defName = 'Aux' + ( id + 1 ).toString();
    //     if ( id === 0 ) defName = 'Spa';
    //     else if ( id === 5 ) defName = 'Pool';
    //     else if ( id < 5 ) defName = 'Aux' + id.toString();
    //     return defName;
    // }
    public get macro (): boolean { return this.data.macro; }
    public set macro ( val: boolean ) { this.data.macro = val; }
    public get lightingTheme (): number { return this.data.lightingTheme; }
    public set lightingTheme ( val: number ) { this.data.lightingTheme = val; }
    public getLightThemes ()
    {
        let themes = [];
        console.log( 'IntelliTouch Get Light Theme' )
        // switch ( this.type )
        // {
        //     case 5: // Intellibrite
        //     case 8: // Magicstream
        //         return Enums.IntelliBriteColors.get();
        //     default:
        //         return [];
        // }
    }
}
export class IntelliBriteCollection extends EqItemCollection<IntelliBrite> {
    constructor( data: any, name?: string ) { super( data, name || 'sensors' ); }
    public createItem ( data: any ): IntelliBrite { return new IntelliBrite( data ); }
    public queueConfig (): ConfigRequest
    {
        var req = new IntelliTouchConfigRequest( 231, [] );
        return req;
    }
}
export class IntelliBrite extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get position (): number { return this.data.position; }
    public set position ( val: number ) { this.data.position = val; }
    public get color (): number { return this.data.color; }
    public set color ( val: number ) { this.data.color = val; }
    public get colorSet (): number { return this.data.colorSet; }
    public set colorSet ( val: number ) { this.data.colorSet = val; }
    public get swimDelay (): number { return this.data.swimDelay; }
    public set swimDelay ( val: number ) { this.data.swimDelay = val; }
    public get mode (): number { return this.data.mode; }
    public set mode ( val: number ) { this.data.mode = val; }
}
export class FeatureCollection extends EqItemCollection<Feature> {
    constructor( data: any, name?: string ) { super( data, name || 'features' ); }
    public createItem ( data: any ): Feature { return new Feature( data ); }
    public queueConfig ( ver: number ): IntelliCenterConfigRequest
    {
        var req = new IntelliCenterConfigRequest( 2, ver, [ 0, 1, 2, 3, 4, 5 ] );
        // Only add in the items that we need for now.  We will queue the optional packets later.  The first 6 packets
        // are required but we can reduce the number of names returned by only requesting the data after the names have been processed.
        var self = this;
        req.oncomplete = function ( req: IntelliCenterConfigRequest ) { self.queueFeatureNames( req ); };
        return req;
    }
    private queueFeatureNames ( req: IntelliCenterConfigRequest )
    {
        req.fillRange( 6, Math.min( Math.ceil( this.data.length / 2 ) + 5, 21 ) );
    }
}
export class Feature extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get freeze (): boolean { return this.data.freeze; }
    public set freeze ( val: boolean ) { this.data.freeze = val; }
    public get showInFeatures (): boolean { return this.data.showInFeatures; }
    public set showInFeatures ( val: boolean ) { this.data.showInFeatures = val; }
    public get eggTimer (): number { return this.data.eggTimer; }
    public set eggTimer ( val: number ) { this.data.eggTimer = val; }
}
export interface PumpCollection
{
    createItem ( data: any ): Pump;
    queueConfig ( ver?: number ): ConfigRequest;
}
export class PumpCollection extends EqItemCollection<Pump> {
    constructor( data: any, name?: string ) { super( data, name || 'pumps' ); }
    public createItem ( data: any ): Pump { return new Pump( data ); }
}
export class IntelliCenterPumpCollection extends PumpCollection
{
    public queueConfig ( ver: number ): ConfigRequest
    {
        var self = this;
        var req = new IntelliCenterConfigRequest( 4, ver, [ 4 ], function ( req: IntelliCenterConfigRequest ) { self.queuePumpNames( req ) } );
        req.fillRange( 0, 3 );
        req.fillRange( 5, 18 );
        return req;
    }
    private queuePumpNames ( req: IntelliCenterConfigRequest )
    {
        var pumpCount = 0;
        for ( var i = 0; i < this.data.length; i++ )
        {
            if ( this.data[ i ].isActive ) pumpCount++;
        }
        if ( pumpCount > 0 )
        {
            req.fillRange( 19, Math.min( Math.ceil( pumpCount / 2 ) + 18, 26 ) );
        }
    }
}
export class IntelliTouchPumpCollection extends PumpCollection
{
    public queueConfig ()
    {
        var req = new IntelliTouchConfigRequest( 216, [] );
        req.fillRange( 1, sys.equipment.maxPumps );
        return req;
    }
}
export class Pump extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get minSpeed (): number { return this.data.minSpeed; }
    public set minSpeed ( val: number ) { this.data.minSpeed = val; }
    public get maxSpeed (): number { return this.data.maxSpeed; }
    public set maxSpeed ( val: number ) { this.data.maxSpeed = val; }
    public get primingSpeed (): number { return this.data.primingSpeed; }
    public set primingSpeed ( val: number ) { this.data.primingSpeed = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get flowStepSize (): number { return this.data.flowStepSize; }
    public set flowStepSize ( val: number ) { this.data.flowStepSize = val; }
    public get minFlow (): number { return this.data.minFlow; }
    public set minFlow ( val: number ) { this.data.minFlow = val; }
    public get maxFlow (): number { return this.data.maxFlow; }
    public set maxFlow ( val: number ) { this.data.maxFlow = val; }
    public get address (): number { return this.data.address; }
    public set address ( val: number ) { this.data.address = val; }
    public get primingTime (): number { return this.data.primingTime; }
    public set primingTime ( val: number ) { this.data.primingTime = val; }
    public get speedStepSize (): number { return this.data.speedStepSize; }
    public set speedStepSize ( val: number ) { this.data.speedStepSize = val; }
    public get turnovers () { return this.data.turnovers; }
    public set turnovers ( val: number ) { this.data.turnovers = val; }
    private createConfigMessages ()
    {
        //[255, 0, 255][165, 63, 15, 16, 168, 34][4, 0, 0, 3, 0, 96, 194, 1, 122, 13, 15, 130, 1, 196, 9, 10, 0, 5, 5, 0, 128, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0][10, 108]
        //[255, 0, 255][165, 63, 15, 16, 168, 35][4, 1, 0, 158, 7, 102, 8, 46, 9, 202, 8, 194, 1, 194, 1, 194, 1, 194, 1, 70, 105, 108, 116, 101, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][9, 97]

        //[255, 0, 255][165, 63, 16, 15, 168, 34][4, 0, 1, 3, 0, 97, 194, 1, 122, 13, 15, 130, 1, 196, 9, 10, 0, 5, 129, 8, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0][11, 113]
        //[255, 0, 255][165, 63, 15, 16, 168, 34][4, 0, 1, 3, 0, 97, 194, 1, 122, 13, 15, 130, 1, 196, 9, 10, 0, 5, 129, 8, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0][11, 113]
        //[255, 0, 255][165, 63, 16, 15, 168, 34][4, 0, 1, 3, 0, 287,194,1,122,13,15,130,1,196,9,100,0,5,129,8,255,255,255,255,255,255,0,0,0,0,0,0,0,0][12,137]

        //[255, 0, 255][165, 63, 16, 15, 168, 26][4, 1, 1, 246, 9, 126, 4, 194, 1, 194, 1, 194, 1, 194, 1, 194, 1, 194, 1, 70, 101, 97, 116, 117, 114, 101][10, 170]
        //[255, 0, 255][165, 63, 15, 16, 168, 35][4, 1, 1, 246, 9, 226, 4, 194, 1, 194, 1, 194, 1, 194, 1, 194, 1, 194, 1, 70, 101, 97, 116, 117, 114, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0][11, 23]

        let outSettings = Outbound.createMessage( 168, [ 4, 0, this.id - 1, this.type, 0, this.address,
            this.minSpeed - ( Math.floor( this.minSpeed / 256 ) * 256 ), Math.floor( this.minSpeed / 256 ), this.maxSpeed - ( Math.floor( this.maxSpeed / 256 ) * 256 ), Math.floor( this.maxSpeed / 256 ),
            this.minFlow, this.maxFlow,
            this.flowStepSize, this.primingSpeed - ( Math.floor( this.primingSpeed / 256 ) * 256 ), Math.floor( this.primingSpeed / 256 ), this.speedStepSize / 10, this.primingTime, 5,
            255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0 ], 0 ); // All the circuits and units.
        //new Response(16, Message.pluginAddress, 1, [168]));
        let outName = Outbound.createMessage( 168, [ 4, 1, this.id - 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ], 0 );
        //new Response(16, Message.pluginAddress, 1, [168]));
        for ( let i = 0; i < 8; i++ )
        {
            let circuit = this.circuits.getItemById( i + 1 );
            if ( typeof ( circuit.circuit ) === "undefined" || circuit.circuit === 255 )
            {
                outSettings.payload[ i + 18 ] = 255;
                // If this is a VF or VSF then we want to put these units in the minimum flow category.
                switch ( this.type )
                {
                    case 1: // SS
                    case 2: // DS
                        outName.payload[ ( i * 2 ) + 3 ] = 0;
                        outName.payload[ ( i * 2 ) + 4 ] = 0;
                        break;
                    case 4: // VSF
                    case 5: // VF
                        outName.payload[ ( i * 2 ) + 3 ] = this.minSpeed - ( Math.floor( this.minFlow / 256 ) * 256 );
                        outName.payload[ ( i * 2 ) + 4 ] = Math.floor( this.minFlow / 256 );
                        break;
                    default: // VS
                        outName.payload[ ( i * 2 ) + 3 ] = this.minSpeed - ( Math.floor( this.minSpeed / 256 ) * 256 );
                        outName.payload[ ( i * 2 ) + 4 ] = Math.floor( this.minSpeed / 256 );
                        break;
                }
            }
            else
            {
                outSettings.payload[ i + 18 ] = circuit.circuit - 1; // Set this to the index not the id.
                outSettings.payload[ i + 26 ] = circuit.units;
                switch ( this.type )
                {
                    case 1: // SS
                        outName.payload[ ( i * 2 ) + 3 ] = 0;
                        outName.payload[ ( i * 2 ) + 4 ] = 0;
                        break;
                    case 2: // DS
                        outName.payload[ ( i * 2 ) + 3 ] = 1;
                        outName.payload[ ( i * 2 ) + 4 ] = 0;
                        break;
                    case 4: // VSF
                    case 5: // VF
                        outName.payload[ ( i * 2 ) + 3 ] = circuit.flow - ( Math.floor( circuit.flow / 256 ) * 256 );
                        outName.payload[ ( i * 2 ) + 4 ] = Math.floor( circuit.flow / 256 );
                        break;
                    default: // VS
                        outName.payload[ ( i * 2 ) + 3 ] = circuit.speed - ( Math.floor( circuit.speed / 256 ) * 256 );
                        outName.payload[ ( i * 2 ) + 4 ] = Math.floor( circuit.speed / 256 );
                        break;
                }
            }
        }
        outName.appendPayloadString( this.name, 16 );
        return [ outSettings, outName ];

    }
    public get circuits (): PumpCircuitCollection { return new PumpCircuitCollection( this.data, 'circuits' ); }
    public applyChanges ()
    {
        let arr = this.createConfigMessages();
        for ( let i = 0; i < arr.length; i++ )
            conn.queueSendMessage( arr[ i ] );
    }
    public setCircuitRate ( circuitId: number, rate: number )
    {
        let c = this.circuits.getItemById( circuitId );
        if ( c.units === 0 ) c.speed = rate;
        else c.flow = rate;
        this.applyChanges();
    }
}
export class PumpCircuitCollection extends EqItemCollection<PumpCircuit> {
    constructor( data: any, name?: string ) { super( data, name || 'circuits' ); }
    public createItem ( data: any ): PumpCircuit { return new PumpCircuit( data ); }
}
export class PumpCircuit extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get circuit (): number { return this.data.circuit; }
    public set circuit ( val: number ) { this.data.circuit = val; }
    public get flow (): number { return this.data.flow; }
    public set flow ( val: number ) { this.data.flow = val; }
    public get speed (): number { return this.data.speed; }
    public set speed ( val: number ) { this.data.speed = val; }
    public get units (): number { return this.data.units; }
    public set units ( val: number ) { this.data.units = val; }
    public get body (): number { return this.data.body; }
    public set body ( val: number ) { this.data.body = val; }
}
export interface ChlorinatorCollection
{
    createItem ( data: any ): Chlorinator;
    queueConfig ( ver?: number ): ConfigRequest;
}
export class ChlorinatorCollection extends EqItemCollection<Chlorinator> {
    constructor( data: any, name?: string ) { super( data, name || 'chlorinators' ); }
    public createItem ( data: any ): Chlorinator { return new Chlorinator( data ); }
}
export class IntelliCenterChlorinatorCollection extends ChlorinatorCollection
{
    public queueConfig ( ver: number ): IntelliCenterConfigRequest { return new IntelliCenterConfigRequest( 7, ver, [ 0 ] ); }
}
export class IntelliTouchChlorinatorCollection extends ChlorinatorCollection
{
    public queueConfig (): IntelliTouchConfigRequest { return new IntelliTouchConfigRequest( 217, [ 0 ] ) }
}
export class Chlorinator extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get body (): number { return this.data.body; }
    public set body ( val: number ) { this.data.body = val; }
    public get poolSetpoint (): number { return this.data.poolSetpoint; }
    public set poolSetpoint ( val: number ) { this.data.poolSetpoint = val; }
    public get spaSetpoint (): number { return this.data.spaSetpoint; }
    public set spaSetpoint ( val: number ) { this.data.spaSetpoint = val; }
    public get superChlorHours (): number { return this.data.superChlorHours; }
    public set superChlorHours ( val: number ) { this.data.superChlorHours = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get address (): number { return this.data.address; }
    public set address ( val: number ) { this.data.address = val; }
    public get superChlor (): boolean { return this.data.suplerChlor; }
    public set superChlor ( val: boolean ) { this.data.suplerChlor = val; }
    public set name ( val: string ) { this.data.name = val };
    public get name (): string { return this.data.name; }
}
interface ValveCollection
{
    createItem ( data: any, name?: string ): Valve;
    queueConfig ( ver?: number ): ConfigRequest;
}
abstract class ValveCollection extends EqItemCollection<Valve> implements ValveCollection
{
    constructor( data: any, name?: string ) { super( data, name || 'valves' ); }
    public createItem ( data: any ): Valve { return new Valve( data ); }
    // public abstract queueConfig (ver: number): ConfigRequest;
}
export class IntelliCenterValveCollection extends ValveCollection
{
    constructor( data: any, name?: string ) { super( data, name || 'valves' ); }
    public queueConfig ( ver: number ): ConfigRequest
    {
        var req = new IntelliCenterConfigRequest( 9, ver, [ 0 ] );
        req.fillRange( 1, Math.min( Math.ceil( sys.equipment.maxValves / 2 ) + 1, 14 ) );
        return req;
    }
}
export class IntelliTouchValveCollection extends ValveCollection
{
    constructor( data: any, name?: string ) { super( data, name || 'valves' ); }
    public queueConfig (): ConfigRequest
    {
        var req = new IntelliTouchConfigRequest( 221, [ 0 ] );
        return req;
    }
}
export class Valve extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get circuit (): number { return this.data.circuit; }
    public set circuit ( val: number ) { this.data.circuit = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
}
export interface HeaterCollection
{
    createItem ( data: any ): Heater;
    queueConfig ( ver?: number ): ConfigRequest;
    queueConfigHeatPump (): ConfigRequest;
}
export class HeaterCollection extends EqItemCollection<Heater> {
    constructor( data: any, name?: string ) { super( data, name || 'heaters' ); }
    public createItem ( data: any ): Heater { return new Heater( data ); }
}
export class IntelliCenterHeaterCollection extends HeaterCollection
{
    public queueConfig ( ver: number )
    {
        var self = this;
        return new IntelliCenterConfigRequest( 10, ver, [ 0, 1, 2, 3, 4 ], function ( req: IntelliCenterConfigRequest ) { self.queueHeaterNames( req ); } );
    }
    public queueHeaterNames ( req: IntelliCenterConfigRequest )
    {
        if ( this.data.length > 0 )
        {
            req.fillRange( 5, Math.min( Math.ceil( this.data.length / 2 ) + 4, 12 ) );
        }
    }
}
export class IntelliTouchHeaterCollection extends HeaterCollection
{
    public queueConfig () { return new IntelliTouchConfigRequest( 200, [ 0 ] ); }
    public queueConfigHeatPump () { return new IntelliTouchConfigRequest( 226, [ 0 ] ) };
}
export class Heater extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get body (): number { return this.data.body; }
    public set body ( val: number ) { this.data.body = val; }
    public get maxBoostTemp (): number { return this.data.maxBoostTemp; }
    public set maxBoostTemp ( val: number ) { this.data.maxBoostTemp = val; }
    public get startTempDelta (): number { return this.data.startTempDelta; }
    public set startTempDelta ( val: number ) { this.data.startTempDelta = val; }
    public get stopTempDelta (): number { return this.data.stopTempDelta; }
    public set stopTempDelta ( val: number ) { this.data.stopTempDelta = val; }
    public get address (): number { return this.data.address; }
    public set address ( val: number ) { this.data.address = val; }
    public get efficiencyMode (): number { return this.data.efficiencyMode; }
    public set efficiencyMode ( val: number ) { this.data.efficiencyMode = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get cooling (): boolean { return this.data.cooling; }
    public set cooling ( val: boolean ) { this.data.cooling = val; }
    public get setTemp (): number { return this.data.setTemp; }
    public set setTemp ( val: number ) { this.data.setTemp = val; }
}
export class CoverCollection extends EqItemCollection<Cover> {
    constructor( data: any, name?: string ) { super( data, name || 'covers' ); }
    public createItem ( data: any ): Cover { if ( typeof ( data.circuits ) === "undefined" ) data.circuits = []; return new Cover( data ); }
    public queueConfig ( ver: number ): IntelliCenterConfigRequest
    {
        return new IntelliCenterConfigRequest( 14, ver, [ 0, 1 ] );
    }
}
export class Cover extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get body (): number { return this.data.body; }
    public set body ( val: number ) { this.data.body = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get normallyOn (): boolean { return this.data.normallyOn; }
    public set normallyOn ( val: boolean ) { this.data.normallyOn = val; }
    public get circuits (): number[] { return this.data.circuits; }
    public set circuits ( val: number[] ) { this.data.circuits = val; }
}
export class CircuitGroupCircuitCollection extends EqItemCollection<CircuitGroupCircuit> {
    constructor( data: any, name?: string ) { super( data, name || 'circuits' ); }
    public createItem ( data: any ): CircuitGroupCircuit { return new CircuitGroupCircuit( data ); }
}
export class CircuitGroupCircuit extends EqItem
{
    public get circuit (): number { return this.data.circuit; }
    public set circuit ( val: number ) { this.data.circuit = val; }
    public get lightingTheme (): number { return this.data.lightingTheme; }
    public set lightingTheme ( val: number ) { this.data.lightingTheme = val; }

}
export class CircuitGroupCollection extends EqItemCollection<CircuitGroup> {
    constructor( data: any, name?: string ) { super( data, name || 'circuitGroups' ); }
    public createItem ( data: any ): CircuitGroup { return new CircuitGroup( data ); }
    public queueConfig ( ver: number ): IntelliCenterConfigRequest
    {
        var self = this;
        return new IntelliCenterConfigRequest( 6, ver, [ 32, 33 ], function ( req: IntelliCenterConfigRequest ) { self.queueGroupAttrs( req ); } );
    }
    private queueGroupAttrs ( req: IntelliCenterConfigRequest )
    {
        if ( this.data.length > 0 )
        {
            //req.fillRange(0, this.data.length - 1);
            req.fillRange( 0, 15 );
            //req.fillRange(16, this.data.length + 15);
            req.fillRange( 16, 31 );
            req.fillRange( 34, 35 );
            //if (this.data.length > 16) req.fillRange(35, 35);
            req.fillRange( 36, 50 );
        }
    }

}
export class CircuitGroup extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get eggTimer (): number { return this.data.eggTimer; }
    public set eggTimer ( val: number ) { this.data.eggTimer = val; }

    public get circuits (): CircuitGroupCircuitCollection { return new CircuitGroupCircuitCollection( this.data, 'circuits' ); }
}
export interface RemoteCollection
{
    createItem ( data: any ): Remote;
    queueConfig ( ver?: number ): ConfigRequest;
    queueConfigIs4Is10 (): ConfigRequest;
    queueConfigSpaSide (): ConfigRequest;
}
export class RemoteCollection extends EqItemCollection<Remote> {
    constructor( data: any, name?: string ) { super( data, name || 'remotes' ); }
    public createItem ( data: any ): Remote { return new Remote( data ); }
}
export class IntelliCenterRemoteCollection extends RemoteCollection
{
    public queueConfig ( ver: number ): IntelliCenterConfigRequest
    {
        var self = this;
        return new IntelliCenterConfigRequest( 5, ver, [ 0, 1 ], function ( req: IntelliCenterConfigRequest ) { return self.queueRemoteAttrs( req ); } );
    }
    private queueRemoteAttrs ( req: IntelliCenterConfigRequest )
    {
        if ( this.data.length > 2 )
        {
            req.fillRange( 3, this.data.length - 2 + 3 );
        }
    }
}
export class IntelliTouchRemoteCollection extends RemoteCollection
{
    public queueConfig (): ConfigRequest
    {
        let req = new IntelliTouchConfigRequest( 225, [ 0 ] ); // intelliflo
        return req;
    }
    public queueConfigIs4Is10 (): ConfigRequest
    {
        let req = new IntelliTouchConfigRequest( 224, [ 0 ] ); // intelliflo
        return req;
    }
    public queueConfigSpaSide (): ConfigRequest
    {
        let req = new IntelliTouchConfigRequest( 214, [ 0 ] ); // intelliflo
        return req;
    }
}
export class Remote extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get type (): number { return this.data.type; }
    public set type ( val: number ) { this.data.type = val; }
    public get isActive (): boolean { return this.data.isActive; }
    public set isActive ( val: boolean ) { this.data.isActive = val; }
    public get hardwired (): boolean { return this.data.hardwired; }
    public set hardwired ( val: boolean ) { this.data.hardwired = val; }
    public get body (): number { return this.data.body; }
    public set body ( val: number ) { this.data.body = val; }
    public get pumpId (): number { return this.data.pumpId; }
    public set pumpId ( val: number ) { this.data.pumpId = val; }
    public get address (): number { return this.data.address; }
    public set address ( val: number ) { this.data.address = val; }
    public get button1 (): number { return this.data.button1; }
    public set button1 ( val: number ) { this.data.button1 = val; }
    public get button2 (): number { return this.data.button2; }
    public set button2 ( val: number ) { this.data.button2 = val; }
    public get button3 (): number { return this.data.button3; }
    public set button3 ( val: number ) { this.data.button3 = val; }
    public get button4 (): number { return this.data.button4; }
    public set button4 ( val: number ) { this.data.button4 = val; }
    public get button5 (): number { return this.data.button5; }
    public set button5 ( val: number ) { this.data.button5 = val; }
    public get button6 (): number { return this.data.button6; }
    public set button6 ( val: number ) { this.data.button6 = val; }
    public get button7 (): number { return this.data.button7; }
    public set button7 ( val: number ) { this.data.button7 = val; }
    public get button8 (): number { return this.data.button8; }
    public set button8 ( val: number ) { this.data.button8 = val; }
    public get button9 (): number { return this.data.button9; }
    public set button9 ( val: number ) { this.data.button9 = val; }
    public get button10 (): number { return this.data.button10; }
    public set button10 ( val: number ) { this.data.button10 = val; }
    public set stepSize ( val: number ) { this.data.stepSize = val; }
    public get stepSize (): number { return this.data.stepSize; }
}
export class SecurityRoleCollection extends EqItemCollection<SecurityRole> {
    constructor( data: any, name?: string ) { super( data, name || 'roles' ); }
    public createItem ( data: any ): SecurityRole { return new SecurityRole( data ); }
}
export class SecurityRole extends EqItem
{
    public get id (): number { return this.data.id; }
    public set id ( val: number ) { this.data.id = val; }
    public get name (): string { return this.data.name; }
    public set name ( val: string ) { this.data.name = val; }
    public get timeout (): number { return this.data.timeout; }
    public set timeout ( val: number ) { this.data.timeout = val; }
    public get flag1 (): number { return this.data.flag1; }
    public set flag1 ( val: number ) { this.data.flag1 = val; }
    public get flag2 (): number { return this.data.flag2; }
    public set flag2 ( val: number ) { this.data.flag2 = val; }
    public get pin (): string { return this.data.pin; }
    public set pin ( val: string ) { this.data.pin = val; }
}
export class Security extends EqItem
{

    public get enabled (): boolean { return this.data.enabled; }
    public set enabled ( val: boolean ) { this.data.enabled = val; }
    public get roles (): SecurityRoleCollection { return new SecurityRoleCollection( this.data, 'roles' ); }
    public queueConfig ( ver: number ): ConfigRequest { return new IntelliCenterConfigRequest( 11, ver, [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ] ); }
}


interface ConfigRequest
{
    failed: boolean;
    version: number;
    items: number[];
    acquired: number[];
    oncomplete: Function;
    name: string;
    category: any;
    fillRange ( start: number, end: number ): void;
    isComplete: boolean;
    removeItem ( byte: number ): void;
    setcategory?: any;

}
class ConfigRequestBase implements ConfigRequest
{
    public failed: boolean = false;
    public version: number = 0; // maybe not used for intellitouch
    public items: number[] = [];
    public acquired: number[] = [];  // used?
    public oncomplete: Function;
    public name: string;
    public category: any;
    public fillRange ( start: number, end: number ) { for ( let i = start; i <= end; i++ ) this.items.push( i ); }
    public get isComplete (): boolean { return this.items.length === 0; }
    public removeItem ( byte: number )
    {
        for ( let i = this.items.length - 1; i >= 0; i-- )
        {
            if ( this.items[ i ] == byte ) this.items.splice( i, 1 );
        }
    }
}
export class IntelliCenterConfigRequest extends ConfigRequestBase
{
    constructor( cat: number, ver: number, items?: number[], oncomplete?: Function )
    {
        super();
        this.category = cat;
        this.version = ver;
        if ( typeof ( items ) !== "undefined" ) this.items.push.apply( this.items, items );
        this.oncomplete = oncomplete;
    }
    public category: IntelliCenterConfigCategories;
}
export class IntelliTouchConfigRequest extends ConfigRequestBase
{
    constructor( setcat: number, items?: number[], oncomplete?: Function )
    {
        super();
        this.setcategory = setcat;
        setcat === GetIntelliTouchConfigCategories.version ? this.category = IntelliTouchConfigCategories.version : this.category = setcat & 63;
        // this.version = ver;
        if ( typeof ( items ) !== "undefined" ) this.items.push.apply( this.items, items );
        this.oncomplete = oncomplete;
    }
    public category: IntelliTouchConfigCategories;
    public setcategory: GetIntelliTouchConfigCategories;
}
// interface ConfigQueue
// {
//     closed: boolean;
//     close: Function;
//     queue: ConfigRequest[];
//     curr: ConfigRequest;
//     removeItem ( cat: number, itm: number ): void;
//     totalItems: number;
//     remainingItems: number;
//     percent: number;
//     push ( req: ConfigRequest ): void;
//     processNext ( msg?: Outbound ): void;
// }
class ConfigQueue 
{
    public queue: ConfigRequest[] = [];
    public curr: ConfigRequest = null;
    public closed: boolean = false;
    public close () { this.closed = true; this.queue.length = 0; }
    public removeItem ( cat: number, itm: number )
    {
        for ( let i = this.queue.length - 1; i >= 0; i-- )
        {
            if ( this.queue[ i ].category === cat ) this.queue[ i ].removeItem( itm );
            if ( this.queue[ i ].isComplete ) this.queue.splice( i, 1 );
        }
    }
    public totalItems: number = 0;
    public get remainingItems (): number
    {
        let c = this.queue.reduce( ( prev: number, curr: IntelliCenterConfigRequest ): number => { return prev += curr.items.length; }, 0 );
        c = c + ( ( this.curr ) ? this.curr.items.length : 0 );
        return c;
    }
    public get percent (): number
    {
        return this.totalItems !== 0 ? 100 - Math.round( ( this.remainingItems / this.totalItems ) * 100 ) : 100;
    }
    public push ( req: ConfigRequest )
    {
        this.queue.push( req );
        this.totalItems += req.items.length;
    }
    processNext ( msg?: Outbound ) { };  // over written in extended class
}

class IntelliCenterConfigQueue extends ConfigQueue
{
    public processNext ( msg?: Outbound )
    {
        if ( sys._configQueue.closed ) return;
        if ( typeof ( msg ) !== "undefined" && msg !== null )
        {
            if ( !msg.failed )
            {
                // Remove all references to future items. We got it so we don't need it again.
                sys._configQueue.removeItem( msg.payload[ 0 ], msg.payload[ 1 ] );
                if ( sys._configQueue.curr && sys._configQueue.curr.isComplete )
                {
                    if ( !sys._configQueue.curr.failed )
                    {
                        // Call the identified callback.  This may add additional items.
                        if ( typeof ( sys._configQueue.curr.oncomplete ) === 'function' )
                        {
                            sys._configQueue.curr.oncomplete( sys._configQueue.curr );
                            sys._configQueue.curr.oncomplete = undefined;
                        }
                        // Let the process add in any additional information we might need.  When it does
                        // this it will set the isComplete flag to false.
                        if ( sys._configQueue.curr.isComplete )
                            sys.configVersion[ IntelliCenterConfigCategories[ sys._configQueue.curr.category ] ] = sys._configQueue.curr.version;
                    }
                    else
                    {
                        // We failed to get the data.  Let the system retry when
                        // we are done with the queue.
                        sys.configVersion[ IntelliCenterConfigCategories[ sys._configQueue.curr.category ] ] = 0;
                    }
                }
            }
            else
                sys._configQueue.curr.failed = true;
        }
        if ( !sys._configQueue.curr && sys._configQueue.queue.length > 0 ) sys._configQueue.curr = sys._configQueue.queue.shift();
        if ( !sys._configQueue.curr )
        {
            // There never was anything for us to do. We will likely never get here.
            state.status = 0;
            state.emitControllerChange();
            return;
        }
        else
            state.status = Enums.ControllerStatus.transform( 1, sys._configQueue.percent );
        // Shift to the next config queue item.
        while ( sys._configQueue.queue.length > 0 && sys._configQueue.curr.isComplete )
        {
            sys._configQueue.curr = sys._configQueue.queue.shift() || null;
        }
        let itm = 0;
        if ( sys._configQueue.curr && !sys._configQueue.curr.isComplete )
        {
            itm = sys._configQueue.curr.items.shift();
            let out: Outbound = new Outbound( Protocol.Broadcast, Message.pluginAddress, 15, 222, [ sys._configQueue.curr.category, itm ], 5,
                new Response( 16, 15, 30, [ sys._configQueue.curr.category, itm ], 30, sys._configQueue.processNext ) );
            setTimeout( conn.queueSendMessage, 50, out );
        }
        else
        {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 0;
            sys._configQueue.curr = null
            setTimeout( sys.checkConfiguration, 100 );
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
}
class IntelliTouchConfigQueue extends ConfigQueue
{
    public processNext ( msg?: Outbound )
    {
        if ( sys._configQueue.closed ) return;
        if ( typeof ( msg ) !== "undefined" && msg !== null )
        {
            if ( !msg.failed )
            {
                // Remove all references to future items. We got it so we don't need it again.
                sys._configQueue.removeItem( msg.action, msg.payload[ 0 ] );
                if ( sys._configQueue.curr && sys._configQueue.curr.isComplete )
                {
                    if ( !sys._configQueue.curr.failed )
                    {
                        // Call the identified callback.  This may add additional items.
                        if ( typeof ( sys._configQueue.curr.oncomplete ) === 'function' )
                        {
                            sys._configQueue.curr.oncomplete( sys._configQueue.curr );
                            sys._configQueue.curr.oncomplete = undefined;
                        }
                        // Let the process add in any additional information we might need.  When it does
                        // this it will set the isComplete flag to false.
                        /* if ( sys._configQueue.curr.isComplete )
                          sys.configVersion[ GetConfigCategories[ sys._configQueue.curr.setcategory ] ] = sys._configQueue.curr.version; */
                    }
                    else
                    {
                        // We failed to get the data.  Let the system retry when
                        // we are done with the queue.
                        /* sys.configVersion[ GetConfigCategories[ sys._configQueue.curr.setcategory ] ] = 0; */
                    }
                }
            }
            else
                sys._configQueue.curr.failed = true;
        }
        if ( !sys._configQueue.curr && sys._configQueue.queue.length > 0 ) sys._configQueue.curr = sys._configQueue.queue.shift();
        if ( !sys._configQueue.curr )
        {
            // There never was anything for us to do. We will likely never get here.
            state.status = 0;
            state.emitControllerChange();
            return;
        }
        else
            state.status = Enums.ControllerStatus.transform( 1, sys._configQueue.percent );
        // Shift to the next config queue item.
        logger.silly( `Config Queue Completed... ${ sys._configQueue.percent }% (${ sys._configQueue.remainingItems } remaining)` );
        while ( sys._configQueue.queue.length > 0 && sys._configQueue.curr.isComplete )
        {
            sys._configQueue.curr = sys._configQueue.queue.shift() || null;
        }
        let itm = 0;
        if ( sys._configQueue.curr && !sys._configQueue.curr.isComplete )
        {
            itm = sys._configQueue.curr.items.shift();
            let out: Outbound = new Outbound( Protocol.Broadcast, Message.pluginAddress, 16, sys._configQueue.curr.setcategory, [ itm ], 5,
                new Response( 16, 15, sys._configQueue.curr.category, [ itm ], undefined, () => sys._configQueue.processNext() ) );
            setTimeout( () => conn.queueSendMessage( out ), 50 );
        }
        else
        {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            // state.status = 0;
            // sys._configQueue.curr = null
            // setTimeout( sys.checkConfiguration, 100 );
            logger.info( `IntelliTouch system config complete.` )
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
}
export enum IntelliTouchConfigCategories
{
    dateTime = 5,
    heatTemperature = 8,
    customNames = 10,
    circuits = 11,
    schedules = 17,
    spaSideRemote = 22,
    pumpStatus = 23,
    pumpConfig = 24,
    intellichlor = 25,
    valves = 29,
    highSpeedCircuits = 30,
    is4is10 = 32,
    solarHeatPump = 34,
    delays = 35,
    lightGroupPositions = 39,
    settings = 40,
    version = 252
}
export enum GetIntelliTouchConfigCategories
{
    dateTime = 197,
    heatTemperature = 200,
    customNames = 202,
    circuits = 203,
    schedules = 209,
    spaSideRemote = 214,
    pumpStatus = 215,
    pumpConfig = 216,
    intellichlor = 217,
    valves = 221,
    highSpeedCircuits = 222,
    is4is10 = 224,
    intellifloSpaSideRemotes = 225,
    solarHeatPump = 226,
    delays = 227,
    lightGroupPositions = 231,
    settings = 232,
    version = 253
}
export enum IntelliCenterConfigCategories
{
    options = 0,
    circuits = 1,
    features = 2,
    schedules = 3,
    pumps = 4,
    remotes = 5,
    circuitGroups = 6,
    chlorinators = 7,
    intellichem = 8,
    valves = 9,
    heaters = 10,
    security = 11,
    general = 12,
    equipment = 13,
    covers = 14
}
export var PF = new PoolFactory();
export var sys = {} as PoolSystem;