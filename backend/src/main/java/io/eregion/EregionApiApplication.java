package io.eregion;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class EregionApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(EregionApiApplication.class, args);
	}

}
