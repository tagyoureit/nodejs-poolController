import { Container, Row, Col, Button } from 'reactstrap'
import { setChlor } from './Socket_Client'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import '../css/rangeslider.css'
import * as React from 'react';
import { IStateChlorinator, IState, getItemById } from './PoolController'



interface State
{
  poolSetpoint: number;
  spaSetpoint: number;
  superChlorHours: number;
}

class ChlorinatorCustomSlider extends React.Component<IStateChlorinator, State> {
  constructor( props: IStateChlorinator )
  {
    super( props )

    this.state = {
      poolSetpoint: 0,
      spaSetpoint: -1,
      superChlorHours: 0
    }

    this.onChangePool = this.onChangePool.bind( this )

  }



  componentDidMount ()
  {

    this.setState( { poolSetpoint: this.props.poolSetpoint } )
    this.setState( { spaSetpoint: this.props.spaSetpoint } )
    this.setState( { superChlorHours: this.props.superChlorHours } )
  }

  componentDidUpdate ( prevProps: IStateChlorinator )
  {
    if ( prevProps.poolSetpoint !== this.props.poolSetpoint
    )
      this.setState( { poolSetpoint: this.props.poolSetpoint } )

    if ( prevProps.spaSetpoint !== this.props.spaSetpoint
    )
      this.setState( { spaSetpoint: this.props.spaSetpoint } )

    if ( prevProps.superChlorHours !== this.props.superChlorHours
    )
      this.setState( { superChlorHours: this.props.superChlorHours } )
  }

  onChangePool = ( poolLvl: number ) =>
  {
    this.setState( () =>
    {
      return {
        poolSetpoint: poolLvl,
      }
    } )
  }

  onChangeSpa = ( spaLvl: number ) =>
  {
    this.setState( () =>
    {
      return {
        spaSetpoint: spaLvl,
      }
    } )
  }

  onChangeSuperChlor = ( hours: number ) =>
  {
    this.setState( () =>
    {
      return {
        superChlorHours: hours
      }
    } )
  }

  onChangeComplete = () =>
  {
    setChlor( this.props.id, this.state.poolSetpoint, this.state.spaSetpoint, this.state.superChlorHours )
  }

  // Todo: don't show Spa in single body of water
  render ()
  {
    const heightStyle = {
      height: '300px'
    }
    const customPercentLabels = { 0: "Off", 50: "50%", 100: "100%" };
    const customTimeLabels = { 0: "Off", 12: "12", 24: "24" };

    return (

      <div>
        <Container style={heightStyle} >
          <Row>
          <Col>
            Pool
                <Slider
                  labels={customPercentLabels}
                  value={this.state.poolSetpoint}
                  onChange={this.onChangePool}
                  onChangeComplete={this.onChangeComplete}
                />
            </Col>
          </Row>
          <Row>
          <Col style={{ paddingTop: '25px' }}>
            Spa
                <Slider
                  labels={customPercentLabels}
                  value={this.state.spaSetpoint}
                  onChange={this.onChangeSpa}
                  onChangeComplete={this.onChangeComplete}
                />
            </Col>
          </Row>
          <Row>
            <Col style={{ paddingTop: '25px' }}>
            Super Chlorinate Hours
              <div className='custom-labels'>
                <Slider
                  min={0}
                  max={24}
                  labels={customTimeLabels}
                  value={this.state.superChlorHours}
                  onChange={this.onChangeSuperChlor}
                  onChangeComplete={this.onChangeComplete}
                />
              </div>
            </Col>
          </Row>

        </Container>

      </div >

    )
  }
}

export default ChlorinatorCustomSlider;