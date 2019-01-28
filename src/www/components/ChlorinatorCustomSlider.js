import { Container, Row, Col, Button } from 'reactstrap'
import { setChlorinatorLevels } from './Socket_Client'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'

class ChlorinatorCustomSlider extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      outputPoolPercent: 0,
      outputSpaPercent: -1,
      superChlorinateHours: 0
    }

    this.onChangePool = this.onChangePool.bind(this)

  }



  componentWillMount(props){
    this.setState({ outputPoolPercent: this.props.data.outputPoolPercent })
    this.setState({ outputSpaPercent: this.props.data.outputSpaPercent })
    this.setState({ superChlorinateHours: this.props.data.superChlorinateHours })
  }

  componentDidUpdate(prevProps){

    if (prevProps.data.outputPoolPercent !== this.props.data.outputPoolPercent 
      )
      this.setState({ outputPoolPercent: this.props.data.outputPoolPercent })

    if (prevProps.data.outputSpaPercent !== this.props.data.outputSpaPercent
      )
      this.setState({ outputSpaPercent: this.props.data.outputSpaPercent })

    if (prevProps.data.superChlorinateHours !== this.props.data.superChlorinateHours
      )
      this.setState({ superChlorinateHours: this.props.data.superChlorinateHours })
  }

  onChangePool = (poolLvl) => {
    this.setState((state) => {
      return {
        outputPoolPercent: poolLvl,
      }
    })
  }

  onChangeSpa = (spaLvl) => {
    this.setState((state) => {
      return {
        outputSpaPercent: spaLvl,
      }
    })
  }

  onChangeSuperChlor = (hours) => {
    console.log(`change slider states SUPERCHLOR  ${this.state.superChlorinateHours} to ${hours}`)

    this.setState((state) => {
      return {
        superChlorinateHours: hours
      }
    })
  }

  onChangeComplete = () => {
    setChlorinatorLevels(this.state.outputPoolPercent, this.state.outputSpaPercent, this.state.superChlorinateHours)
  }

  render() {
    const heightStyle = {
      height: '200px'
    }

    return (

      <div>
        <Container style={heightStyle}>
          <Row>
            <Col>
              <Slider className='slider custom-labels'

                labels={{ 0: "Off", 50: "50%", 100: "Super Chlorinate " }}
                value={this.state.outputPoolPercent}
                onChange={this.onChangePool}
                onChangeComplete={this.onChangeComplete}
              />
            </Col>
          </Row>
          <Row>
            <Col>
              <Slider className='slider custom-labels'

                labels={{ 0: "Off", 50: "50%", 100: "Super Chlorinate" }}
                value={this.state.outputSpaPercent}
                onChange={this.onChangeSpa}
                onChangeComplete={this.onChangeComplete}
              />
            </Col>
          </Row>
          <Row>
            <Col>
              <Slider className='slider custom-labels'
                mim={0}
                max={24}
                labels={{ 0: "Off", 12: "12 Hours", 24: "24 Hours" }}
                value={this.state.superChlorinateHours}
                onChange={this.onChangeSuperChlor}
                onChangeComplete={this.onChangeComplete}
              />
            </Col>
          </Row>

        </Container>

      </div >

    )
  }
}

export default ChlorinatorCustomSlider;