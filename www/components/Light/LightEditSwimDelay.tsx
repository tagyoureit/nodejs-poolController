import { Container, Row, Col, Button, Table, Dropdown, ButtonDropdown, DropdownToggle, DropdownItem, DropdownMenu } from 'reactstrap'
import { setLightSwimDelay } from '../Socket_Client'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import '../../css/rangeslider.css'
import * as React from 'react';


//TODO: when the modal is showing and this dropdown is open, the modal is scrolling in the background instead of the dropdown scrolling

interface Props
{
  data: Circuit.LightClass
}

interface State
{
  dropdownOpen: boolean
  disabled: boolean
  targetSwimDelay: number
}

class LightSwimDelay extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      dropdownOpen: false,
      disabled: false,
      targetSwimDelay: -1
    }
    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind( this )

  }
  componentDidUpdate ( prevProps: Props, prevState: State )
  {
    if ( this.state.disabled && (this.state.targetSwimDelay===this.props.data.colorSwimDelay) )
    {
      this.setState( {
        disabled: false,
        targetSwimDelay: 0
      } );
    }
  }
    
  toggleDropDown ()
  {
    this.setState( {
      dropdownOpen: !this.state.dropdownOpen
    } );
  }

  handleClick (event: any)
  {
    setLightSwimDelay( this.props.data.circuit, event.target.value )
    this.setState( {
      disabled: true,
      targetSwimDelay: parseInt(event.target.value)
    } );
  }

  render ()
  {
    const delays = () =>
    {
      let positionArray: number[] = [] 
      for ( let i = 0; i <= 60; i++ )
      {
        positionArray.push(i)
      }

      return (
      <>
         {positionArray.map( i => (
          ( <DropdownItem
            key={`delay${ this.props.data.circuit }${ i }`}
            onClick={this.handleClick}
            value={i}
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
            {this.props.data.colorSwimDelay}{console.log(`If this isn't here, then 0 won't show up as a swim delay current value...????: ${this.props.data.colorSwimDelay}`)}
                    </DropdownToggle>
          <DropdownMenu>
            {delays()}
          </DropdownMenu>
        </ButtonDropdown>

      </div >

    )
  }
}

export default LightSwimDelay;