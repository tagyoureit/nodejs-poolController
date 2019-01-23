import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button, CardFooter, CardGroup
} from 'reactstrap';
import CustomCard from '../components/CustomCard'
import Link from 'next/link'
import DateTime from './DateTime'

class Pump extends React.Component {

    constructor(props) {
        super(props)

        this.handleToggleState = this.handleToggleState.bind(this)

    }

    handleToggleState() {
        //console.log(`toggle ${this.state.data.name} val`)
    }


    render() {

        const colCount = Object.keys(this.props.data).length + 1
        const colWidth = Math.floor(12 / colCount)


        let pumps = Object.entries(this.props.data).map((k) => {

            return (
                <Card key={k[1].pump+'card'}>
                    <CardBody className='p-0' key={k[1].pump+'cardbody'}>
                        <CardTitle className='card-header'>  {k[1].name}</CardTitle>
                        <CardText className='text-right mr-3 pt-0'>
                            Watts: {k[1].watts}
                            <br />
                            RPM: {k[1].rpm}
                            <br />
                            Error: {k[1].err}
                            <br />
                            Drive state: {k[1].drivestate}
                            <br />
                            Mode: {k[1].mode}
                            <br />
                        </CardText>
                    </CardBody>
                </Card>)


        })

        return (
            <div>
                <a name="Pumps" className="anchor"></a>
                <CustomCard name='Pumps' key='title'>
                    <CardGroup className="">
                        {pumps}
                    </CardGroup>
                </CustomCard>
            </div>
        );
    }
}

export default Pump;