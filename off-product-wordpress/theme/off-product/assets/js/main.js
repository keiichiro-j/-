(function () {
	'use strict';

	// Mobile menu toggle.
	var hamburger = document.getElementById( 'off-product-hamburger' );
	var mobileMenu = document.getElementById( 'off-product-mobile-menu' );

	if ( hamburger && mobileMenu ) {
		hamburger.addEventListener( 'click', function () {
			var isOpen = mobileMenu.classList.toggle( 'is-open' );
			hamburger.setAttribute( 'aria-expanded', isOpen ? 'true' : 'false' );
		} );

		mobileMenu.addEventListener( 'click', function ( event ) {
			if ( event.target.tagName === 'A' ) {
				mobileMenu.classList.remove( 'is-open' );
				hamburger.setAttribute( 'aria-expanded', 'false' );
			}
		} );
	}

	// Scroll reveal for sections, cards and the rhizome diagram.
	var revealTargets = document.querySelectorAll( '[data-reveal]' );

	if ( 'IntersectionObserver' in window && revealTargets.length ) {
		var observer = new IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( entry ) {
					if ( entry.isIntersecting ) {
						entry.target.classList.add( 'in-view' );
						observer.unobserve( entry.target );
					}
				} );
			},
			{ threshold: 0.2, rootMargin: '0px 0px -60px 0px' }
		);

		revealTargets.forEach( function ( el ) {
			observer.observe( el );
		} );
	} else {
		revealTargets.forEach( function ( el ) {
			el.classList.add( 'in-view' );
		} );
	}
})();
