<?php
/**
 * Generic page template (固定ページ).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<section class="wrap" style="padding:80px 0;max-width:820px;">
	<?php while ( have_posts() ) : the_post(); ?>
		<article <?php post_class(); ?>>
			<div class="kicker mono" style="margin-bottom:12px;">PAGE</div>
			<h1 style="font-size:32px;margin-bottom:28px;"><?php the_title(); ?></h1>
			<div class="entry-content">
				<?php the_content(); ?>
			</div>
		</article>
	<?php endwhile; ?>
</section>
<?php
get_footer();
