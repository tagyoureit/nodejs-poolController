import { Container, Row, Col, Button } from 'reactstrap'
import { setChlorinatorLevels } from './Socket_Client'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import '../css/rangeslider.css'
import * as React from 'react';


interface SliderProps
{
  className: string;
}

interface State
{
  outputPoolPercent: number;
  outputSpaPercent: number;
  superChlorinateHours: number;
}

class ChlorinatorCustomSlider extends React.Component<Chlorinator.IBaseChlorinator, State> {
  constructor( props: Chlorinator.IBaseChlorinator )
  {
    super( props )

    this.state = {
      outputPoolPercent: 0,
      outputSpaPercent: -1,
      superChlorinateHours: 0
    }

    this.onChangePool = this.onChangePool.bind( this )

  }



  componentWillMount ()
  {
    this.setState( { outputPoolPercent: this.props.outputPoolPercent } )
    this.setState( { outputSpaPercent: this.props.outputSpaPercent } )
    this.setState( { superChlorinateHours: this.props.superChlorinateHours } )
  }

  componentDidUpdate ( prevProps: Chlorinator.IBaseChlorinator )
  {

    if ( prevProps.outputPoolPercent !== this.props.outputPoolPercent
    )
      this.setState( { outputPoolPercent: this.props.outputPoolPercent } )

    if ( prevProps.outputSpaPercent !== this.props.outputSpaPercent
    )
      this.setState( { outputSpaPercent: this.props.outputSpaPercent } )

    if ( prevProps.superChlorinateHours !== this.props.superChlorinateHours
    )
      this.setState( { superChlorinateHours: this.props.superChlorinateHours } )
  }

  onChangePool = ( poolLvl: number ) =>
  {
    this.setState( () =>
    {
      return {
        outputPoolPercent: poolLvl,
      }
    } )
  }

  onChangeSpa = ( spaLvl: number ) =>
  {
    this.setState( () =>
    {
      return {
        outputSpaPercent: spaLvl,
      }
    } )
  }

  onChangeSuperChlor = ( hours: number ) =>
  {
    this.setState( () =>
    {
      return {
        superChlorinateHours: hours
      }
    } )
  }

  onChangeComplete = () =>
  {
    setChlorinatorLevels( this.state.outputPoolPercent, this.state.outputSpaPercent, this.state.superChlorinateHours )
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
                  value={this.state.outputPoolPercent}
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
                  value={this.state.outputSpaPercent}
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
                  value={this.state.superChlorinateHours}
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