
import UtilitiesNavbar from '../utilities/UtilitiesNavbar';
import { Container } from 'reactstrap'
import * as React from 'react';
import Footer from '../Footer'


const UtilitiesLayout = ( props: any ) => (
    
    <div>
        <UtilitiesNavbar />
        <Container>

            <div className="tab-content">
                {props.children===undefined?'Select a utility from the menu':props.children}
                
            </div>

        </Container>

    </div>

)

export default UtilitiesLayout;