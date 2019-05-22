import { Container, Row, Col, Button, Table, DropdownMenu, ButtonDropdown, Dropdown, DropdownItem, DropdownToggle, Breadcrumb, UncontrolledTooltip } from 'reactstrap'
import { setEggTimer, deleteScheduleOrEggTimer } from './Socket_Client'
import 'react-rangeslider/lib/index.css'
import '../css/rangeslider.css'
import * as React from 'react';
import EggTimerCircuit from './EggTimerEditCircuit'
import EggTimerHour from './EggTimerEditHour'
import EggTimerMinute from './EggTimerEditMinute';
import EggTimerAddNew from './EggTimerAddNew'



interface State
{
  dropdownOpen: boolean

}
interface Props
{
  data: ScheduleModule.ScheduleObj
  allCircuits: Circuit.ICurrentCircuitsArr
  idOfFirstUnusedSchedule: number
}

class EggTImerEdit extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      dropdownOpen: false,

    }
    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind( this )
    this.deleteEggTimer = this.deleteEggTimer.bind( this )

  }


  toggleDropDown ()
  {
    this.setState( {
      dropdownOpen: !this.state.dropdownOpen
    } );
  }

  handleClick ( event: any )
  {

    if ( event.target.getAttribute( 'data-type' ) === 'add-new' )
    {
      setEggTimer( this.props.idOfFirstUnusedSchedule, parseInt( event.target.value ), 2, 0 )
    }
    else
    {


      console.log( `type: ${ event.target.getAttribute( 'data-type' ) }  sched id: ${ parseInt( event.target.getAttribute( 'data-schedule-id' ) ) } circuitNum: ${ event.target.value }  ` )

      let _id = parseInt( event.target.getAttribute( 'data-schedule-id' ) )
      let _circuitNum = this.props.data[ _id ].circuitNum
      let _hour = this.props.data[ _id ].duration.hour
      let _minute = this.props.data[ _id ].duration.minute

      switch ( event.target.getAttribute( 'data-type' ) )
      {
        case 'circuit':
          _circuitNum = event.target.value
          break;
        case 'hour':
          _hour = event.target.value;
          break;
        case 'minute':
          _minute = event.target.value
          break;

      }

      setEggTimer( _id, _circuitNum, _hour, _minute )
    }
  }

  deleteEggTimer ( event: any )
  {
    console.log( `deleting schedule id: ${ event.target.getAttribute( 'data-schedule-id' ) }` )
    deleteScheduleOrEggTimer( parseInt( event.target.getAttribute( 'data-schedule-id' ) ) )
  }

  render ()
  {
    let eggTimerAddNew = () =>
    {

      if ( this.props.idOfFirstUnusedSchedule !== -1 )
      {
        return ( <tr>
          <td />
          <td>
            {this.props.idOfFirstUnusedSchedule}
          </td>
          <td>
            <EggTimerAddNew
              data={this.props.allCircuits}
              onClick={this.handleClick}
              idOfFirstUnusedSchedule={this.props.idOfFirstUnusedSchedule}
            /></td><td>
            <a href="#" id="addToolTip"><img src='../images/info.svg' width='20px'/>    Adding an egg timer</a>
            <UncontrolledTooltip placement="top" target="addToolTip" >
              Select a circuit to add an egg timer.
        <p />

              It will default to 2 hours, 0 mins and you can refine it from there.  Note: If slots are available, they will show in both egg timers and schedules.  Select in the appropriate section to add it.
        <p />
              The option to add additional circuits will not appear if there are no available slots.
          </UncontrolledTooltip>
      </td>
        </tr> )
      }
    }



    let eggTimerData =
      Object.entries( this.props.data ).map( ( eggTimer: [ string, ScheduleModule.ScheduleClass ], index: number ) =>
      {
        return ( <tr key={`eggTimerCircuit${ eggTimer[ 1 ].id }`
        }>
          <td>
            <a href='#' onClick={this.deleteEggTimer} data-schedule-id={eggTimer[ 1 ].id}><img src='../images/delete.svg' width='20px' /></a>
          </td>
          <td>
            {eggTimer[ 1 ].id}
          </td>
          <td>
            <EggTimerCircuit data={this.props.allCircuits} currentScheduleId={eggTimer[ 1 ].id} currentCircuit={eggTimer[ 1 ].circuitNum} onClick={this.handleClick} />
          </td>
          <td>
            <EggTimerHour currentHour={eggTimer[ 1 ].duration.hour} currentScheduleId={eggTimer[ 1 ].id} onClick={this.handleClick} />
          </td>
          <td>
            <EggTimerMinute currentMinute={eggTimer[ 1 ].duration.minute} currentScheduleId={eggTimer[ 1 ].id} onClick={this.handleClick} />
          </td>
        </tr> )
      } )

    // div height is 63.  Plus number of egg timers plus 2 (header/add new) + 32px for border
    const heightStyle = {
      height: 63 * ( Object.keys( this.props.data ).length + 1 ) + 32
    }
    return (
      <div>
        <Container style={heightStyle} >
          <Table>
            <thead>
              <tr>
                <th></th>
                <th>Schedule ID</th>
                <th>Circuit (#)</th>
                <th>Hours</th>
                <th>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {eggTimerData}
              {eggTimerAddNew()}
            </tbody>

          </Table>
        </Container>


      </div >

    )
  }
}

export default EggTImerEdit;