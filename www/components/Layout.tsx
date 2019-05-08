
import Navbar from './Navbar';
import { Container } from 'reactstrap'
import * as React from 'react';
import Footer from './Footer'

interface Props
{
    counter: number,
    updateStatus: IUpdateAvailable.Ijsons,
    updateStatusVisibility: string,
    children: any
}

const Layout = ( props: Props ) => (

    <div>
        <Navbar counter={props.counter} />
        <Container>

            <div className="tab-content">

                {props.children}
            </div>

        </Container>
        <Footer updateStatus={props.updateStatus} updateStatusVisibility={props.updateStatusVisibility}/>
    </div>

)

export default Layout;