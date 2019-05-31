import { Container, Row, Col, Button, Table, Dropdown, ButtonDropdown, DropdownToggle, DropdownItem, DropdownMenu } from 'reactstrap'
import * as React from 'react';
import '../../css/dropdownselect.css'

interface Props
{
  data: Circuit.ICurrentCircuitsArr
  idOfFirstUnusedSchedule: number
  onClick: (event: any)=>void
}

interface State
{
  dropdownOpen: boolean
  disabled: boolean
  targetNewScheduleId: number
}

class EggTimerCircuit extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )


    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind(this)

    if ( this.props.idOfFirstUnusedSchedule === -1 )
    {
      this.state = {
        disabled: true,
        dropdownOpen: false,
        targetNewScheduleId: -1
      }
    }
    else
    {
      this.state = {
        dropdownOpen: false,
        disabled: false,
        targetNewScheduleId: -1
      }
    }

  }
  componentDidUpdate ( prevProps: Props, prevState: State )
  {
    if ( this.props.idOfFirstUnusedSchedule!==-1 && this.state.disabled && ( prevState.targetNewScheduleId !== this.props.idOfFirstUnusedSchedule ))
    {
      this.setState( {
        disabled: false,
        targetNewScheduleId: -1,
      } );
    }
  }

  handleClick (event: any)
  {
    this.props.onClick( event )
    this.setState( {
      disabled: true,
      targetNewScheduleId: parseInt(event.target.value)
    })
  }

  toggleDropDown ()
  {
    this.setState( {
      dropdownOpen: !this.state.dropdownOpen
    } );
  }

  render ()
  {
    const circuits = () =>
    {
      let circuitArray: number[] = Object.keys( this.props.data ).map( key => parseInt( key ) )

      return (
        <>
          {circuitArray.map( i => (
            ( <DropdownItem
              key={`eggTimer${ this.props.data[ i ].number }${ i }`}
              onClick={this.handleClick}
              data-type='add-new'
              value={this.props.data[ i ].number}
            >
              {this.props.data[ i ].friendlyName} ({this.props.data[ i ].number})
          </DropdownItem> )
          ) )}
        </>
      )
    }
    return (
      <div>
        <ButtonDropdown isOpen={this.state.dropdownOpen} toggle={this.toggleDropDown} disabled={this.state.disabled} >
          <DropdownToggle caret disabled={this.state.disabled} color='primary'>
            Add an Egg Timer
                    </DropdownToggle>
          <DropdownMenu>
            {circuits()}
          </DropdownMenu>
        </ButtonDropdown>
      </div >
    )
  }
}

export default EggTimerCircuit;