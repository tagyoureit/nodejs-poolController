import { Container, Row, Col, Button, Table, Dropdown, ButtonDropdown, DropdownToggle, DropdownItem, DropdownMenu } from 'reactstrap'
import { setLightPosition } from '../Socket_Client'
import * as React from 'react';


interface Props
{
  currentMinute: number
  currentScheduleId: number
  onClick: ( event: any ) => void
}

interface State
{
  dropdownOpen: boolean
  disabled: boolean
  targetMinute: number
}

class LightPosition extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      dropdownOpen: false,
      disabled: false,
      targetMinute: -1
    }
    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind(this)

  }
  componentDidUpdate ( prevProps: Props, prevState: State )
  {
    if ( this.state.disabled && ( this.state.targetMinute === this.props.currentMinute ) )
    {
      this.setState( {
        disabled: false,
        targetMinute: -1
      } );
    }
  }
  handleClick (event: any)
  {
    this.props.onClick( event )
    this.setState( {
      disabled: true,
      targetMinute: parseInt(event.target.value)
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
    const positions = () =>
    {
      let hoursArray: number[] = []
      for ( let i = 0; i <= 3; i++ )
      {
        hoursArray.push( i*15 )
      }

      return (
        <>
          {hoursArray.map( i => (
            ( <DropdownItem
              key={`hour${ i }`}
              onClick={this.handleClick}
              data-schedule-id={this.props.currentScheduleId}
              data-type='minute'
              value={i}
              className={this.props.currentMinute === i  ? 'dropdown-item-checked' : ''}
            >
              {i}
            </DropdownItem> )

          ) )}
        </>
      )
    }

    return (
      <div>
        <ButtonDropdown isOpen={this.state.dropdownOpen} toggle={this.toggleDropDown} disabled={this.state.disabled} >
          <DropdownToggle caret disabled={this.state.disabled}>
            {this.props.currentMinute}{''}
          </DropdownToggle>
          <DropdownMenu>
            {positions()}
          </DropdownMenu>
        </ButtonDropdown>
      </div >
    )
  }
}

export default LightPosition;